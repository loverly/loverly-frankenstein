/*******************************************************************************
 *
 * Instance.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var TYPES = require('./Types.js');
var MAPPING_TYPES = require('./FieldMappingTypes.js');


/**
 * Create an instance from a model definition and a mapping object.
 *
 * The mapping object defines the data sources and how to save the object.  For
 * a browser-based instance, the mapping should be replaced by an empty mapping
 * so that the entire object is sent via the AJAX data source.
 *
 * @class Instance
 * @constructor
 */
var Instance = function (model, view, fields) {
  var self = this;
  var meta;

  // Wrap all instance data in a __meta property that no one should access
  this.__meta = {};
  meta = this.__meta;

  meta.modelName = model.name;
  meta.definition = model.definition;
  meta.ERROR_MSGS = model.ERROR_MSGS;

  meta.primarySource = model.primarySource;
  meta.sources = model.sources;

  meta.instances = {};

  // Submodel properties
  meta.primaryKey = model.primaryKey;
  meta.foreignKey = model.foreignKey;

  // Is there currently an error?
  meta.hasError = false;

  // When binding, did the object have extra fields?
  meta.hasExtraFields = false;

  // Create a metadata object from the definition to track field changes
  meta.fields = {};
  this.createFieldMetadata(meta.definition, meta.fields);

  // When reading or saving from multiple data sources, it is necessary to
  // maintain a count of how many data sources are left and the callback
  // that should be called once the operations complete
  meta.sourceOp = {};
  meta.sourceOp.count = 0;
  meta.sourceOp.callback = null;
  meta.sourceOp.isFailed = false;
  meta.sourceOp.error = null;

  // Provide access to the node-validator and the check method
  meta.validator = model.validator;

  // Set the default view and fields
  meta.view = view || 'default';
  meta.view_fields = fields || {};

  /**
   * Mark instance for deletion - useful when updating an array of submodels
   *
   * @property shouldDelete
   * @type boolean
   * @private
   */
  var shouldDelete = false;

  /**
   * Returns whether or not this object should be deleted if no argument is
   * given.  If an argument is given, set the value of should delete.
   *
   * @method shouldDelete
   * @param shouldDelete {boolean}
   *   Optional. Whether or not this instance should be marked for deletion
   * @returns {boolean}
   */
  this.shouldDelete = function (val) {
    if (typeof val !== 'undefined') {
      shouldDelete = val;
    }

    return shouldDelete;
  };

  /**
   * The function that should be called once the operation count reaches 0.  The
   * arity of the function should be 2, with the first argument being a potential
   * error.
   *
   * @param cb
   */
  this.setSourceOpCallback = function (cb) {
    self.__meta.sourceOp.callback = cb;
  };

  /**
   * An error occurred during a complex source operation
   *
   * @param err The error that caused the operation to fail
   */
  this.failSourceOp = function (err) {
    var meta = self.__meta;
    meta.sourceOp.error = err;

    // Call the callback with the error
    var cb = meta.sourceOp.callback;
    meta.sourceOp.callback = null;

    // Log the error if the logger is available
    if (err.code !== 404) {
      console.error(
        'Error in source operation for an instance of ' + meta.modelName +
          ' failed with error: ' + JSON.stringify(err)
      );
    }

    // Short circuit the failure if we have already failed this operation
    if (meta.sourceOp.isFailed) {
      console.debug('Operation already failed');
      return;
    } else {
      meta.sourceOp.isFailed = true;
    }

    if (err instanceof Array) {
      err = err[0];
    }

    // Check for database constraint errors
    if (err.code === 'ER_DUP_ENTRY') {
      err = {code: 400, error: err.message};
    } else if (err.code !== 404) {
      err = {code: 500, error: 'Internal Server Error'};
    }

    cb(err, null);
  };

  /**
   * Increment the counter for operations in progress
   */
  this.startSourceOp = function () {
    self.__meta.sourceOp.count++;
  };

  /**
   * Reduce the in-progress count and call the callback if the count goes to 0.
   */
  this.finishSourceOp = function () {
    var cb;
    self.__meta.sourceOp.count--;

    if (self.isSourceOpFailed()) {
      return; // Do nothing if the process already failed
    }

    if (!self.isSourceOpInProgress() && self.__meta.sourceOp.callback) {
      //self.resetFieldState()
      cb = self.__meta.sourceOp.callback;
      self.__meta.sourceOp.callback = null;
      cb(null, self);
    }
  };

  /**
   * A generic handler that will redirect to a successful completion or a failure
   * depending on whether or not the error exists.
   *
   * @method handleSourceOpCompletion
   * @param err
   *   An error resulting from the operation
   */
  this.handleSourceOpCompletion = function (err) {
    if (err) {
      self.failSourceOp(err);
    } else {
      self.finishSourceOp();
    }
  };

  // Set the virtual getters on virtual fields
  this.setVirtualFields(meta.definition, this);
};

// SETUP/UTILITIES =============================================================

/**
 * Recursively search through the definitions and define virtual fields as property
 * getters.
 *
 * @param {Object} definition
 */
Instance.prototype.setVirtualFields = function (definition, obj) {
  var mapping;
  var boundGetter;
  var _this = this;

  for (var i in definition) {
    mapping = definition[i].mapping;

    if (this.isSubDocumentDefinition(definition[i])) {
      obj[i] = {};
      this.setVirtualFields(definition[i], obj[i]);
    } else if (mapping && mapping.type === MAPPING_TYPES.VIRTUAL) {
      boundGetter = this.bindGetter(obj, mapping.get);
      Object.defineProperty(obj, i, {
        enumerable: true,
        writeable: false,
        get: boundGetter
      });
    }
  }
};

/**
 * Bind the getter function to the given object and pass the instance as the first
 * argument.
 *
 * @param obj
 * @param getter
 * @returns {Function}
 */
Instance.prototype.bindGetter = function (obj, getter) {
  var _this = this;
  var boundGetter = getter.bind(obj);
  return function () {
    return boundGetter(_this);
  };
};


/**
 * Is a data source operation in progress?
 *
 */
Instance.prototype.isSourceOpInProgress = function () {
  return (this.__meta.sourceOp.count > 0);
};

/**
 *
 * @returns {boolean}
 */
Instance.prototype.isSourceOpFailed = function () {
  return (this.__meta.sourceOp.isFailed);
};

/**
 * Recursively call this function to create a field metadata object that tracks
 * changes and errors to the field.
 *
 * @param definition
 * @param metadata
 */
Instance.prototype.createFieldMetadata = function (definition, metadata) {
  var i;

  // Track changes to fields and errors on fields
  for (i in definition) {
    metadata[i] = {
      hasChanged: false,
      hasError: false,
      lastError: '',
      previousValue: null
    };

    if (this.isSubDocumentDefinition(definition[i])) {
      this.createFieldMetadata(definition[i], metadata[i]);
    }
  }
};

/**
 * A utility function to identify if this is a field definition or a sub-document
 * definition.
 *
 * @param obj A field definition to check
 * @returns {Boolean} Whether or not this is a sub-document or a regular definition
 */
Instance.prototype.isSubDocumentDefinition = function (obj) {
  var i;

  if (obj instanceof Array) {
    return false;
  }

  for (i in obj) {
    if (typeof obj[i] === 'object' && i !== 'constraints' && i !== 'views' && i !== 'mapping') {
      return true;
    }
  }

  return false;
};

// OPTIONS MANAGEMENT ==========================================================

/**
 * Set the default view for this instance
 *
 * @method setView
 * @param {String} view The view to use when transforming this instance
 */
Instance.prototype.setView = function (view) {
  this.__meta.view = view;
};

/**
 * Set additional fields to include in the view
 *
 * @method setFields
 * @param {Object} fields A hash of fields to add to the view
 */
Instance.prototype.setFields = function (fields) {
  this.__meta.view_fields = fields;
};

// STATE MANAGEMENT ============================================================

/**
 * Sets the value of a property using bind.  Does not handle dot notation.
 *
 * @method set
 * @param {string} key
 * @param {string} value The new value
 */
Instance.prototype.set = function (key, value) {
  var data = {};
  data[key] = value;
  this.bind(data, true);
};

/**
 * Return true if any of the fields have been updated since it was populated from
 * its data sources.
 *
 * Conform to the mongoose.js ODM instance API where you can tell if an instance
 * needs to be saved by checking this function.
 *
 * @method isModified
 */
Instance.prototype.isModified = function () {
  var meta = this.__meta;
  var updatedFields = this.getUpdatedFields(meta.fields, meta.definition, this);
  return !!updatedFields || false;
};

/**
 * Search through the metadata to find fields that have been updated.
 *
 * @param fieldMetadata
 * @param definition
 * @param data
 */
Instance.prototype.getUpdatedFields = function (fieldMetadata, definition, data) {
  var i;
  var updatedFields = {};
  var hasUpdatedField = false;
  var subdocUpdatedFields;

  for (i in definition) {
    if (this.isSubDocumentDefinition(definition[i])) {
      subdocUpdatedFields = this.getUpdatedFields(
        fieldMetadata[i],
        definition[i],
        data[i]
      );

      if (subdocUpdatedFields) {
        hasUpdatedField = true;
        updatedFields[i] = subdocUpdatedFields;
      }
    } else if (fieldMetadata[i].hasChanged) {
      hasUpdatedField = true;
      updatedFields[i] = data[i];
    }
  }

  return (hasUpdatedField) ? updatedFields : false;
};


/**
 * Does nothing except return an empty array to mirror the sequelize.js interface
 *
 * @method changed
 * @returns {Array}
 */
Instance.prototype.changed = function () {
  return [];
};



// VALIDATION ==================================================================


/**
 * Runs through all of the validation rules for the instance's fields and
 * determines whether or not the instance as a whole is valid.
 *
 * @returns {Boolean} Is the instance as a whole valid?
 */
Instance.prototype.isValid = function () {
  var hasError = this.doDocumentFieldsHaveError(
    this.__meta.definition,
    this.__meta.fields,
    this
  );

  if (hasError) {
    this.__meta.hasError = true;
  } else {
    this.__meta.hasError = false;
  }

  return !this.__meta.hasError;
};

/**
 * A potentially recursive helper function that validated the top level fields
 * in a model and recursively calls itself on sub-models.
 *
 * @param definition
 * @param metadata
 * @param data
 * @returns {Boolean}
 */
Instance.prototype.doDocumentFieldsHaveError = function (definition, metadata, data) {
  var hasError, constraints, field, i, j, subdocErrors;
  var mapping;
  var defaultValue;
  var errorMessage;

  var modelErrorMessages = this.__meta.ERROR_MSGS;
  var validator = this.__meta.validator;
  var args;
  var constraint;
  var isRequired;

  hasError = false;

  for (i in definition) {

    constraints = definition[i].constraints;
    mapping = definition[i].mapping;
    defaultValue = definition[i].defaultValue;
    isRequired = definition[i].required;
    errorMessage = null;

    // Skip virtual fields
    // TODO: We may want to validate these fields
    //       in the future
    if (mapping && mapping.type === MAPPING_TYPES.VIRTUAL) {
      continue;
    }

    // Reset the field - before validating
    metadata[i].hasError = false;

    // Recursively call this helper on nested documents
    if (this.isSubDocumentDefinition(definition[i])) {
      subdocErrors = this.doDocumentFieldsHaveError(
        definition[i],
        metadata[i],
        (typeof data === 'undefined') ? null : data[i]
      );
      metadata[i].hasError = !!subdocErrors;

      // Flag an error if there was an error in the subdoc
      hasError = hasError || subdocErrors;

      // TODO: Change the model definition to have the same properties with
      //       a children object for child definitions
      continue;
    }

    // Submodel properties handle their own validation
    if (mapping && mapping.type === MAPPING_TYPES.SUBMODEL_PROPERTY) {
      hasError = data[i].isValid();
      metadata[i].hasError = hasError;
    }


    if (typeof data === 'object' && data !== null) {
      field = data[i];

      // Try to set the default value for the field if none is set
      if ((typeof field === 'undefined' || field === null) && typeof defaultValue !== 'undefined') {
        // If there is a function to generate the value, use it
        field = (typeof defaultValue === 'function') ? defaultValue() : defaultValue;

        // Set the default value on the object
        // TODO: This will not work for sub-documents - consider moving this to
        //       a pre-validate function that fills out any default values
        var bindData = {};
        bindData[i] = field;
        this.bind(bindData, true);
      }
    } else {
      field = null;
    }

    // Do not validate null fields if they are not required
    if (!isRequired && (typeof field === 'undefined' || field === null || field === '')) {
      continue;
    }

    // Loop through the constraints and make sure that the validation outcomes
    // match the constraint values
    for (j in constraints) {
      constraint = j;
      args = constraints[j];

      // New-style constraint definitions with backwards compatibility
      if (typeof args === 'object' && !(args instanceof Array)) {
        errorMessage = args.msg;

        // Allow for custom validation functions
        constraint = args.isValid || validator[j];
        args = args.args || [];
      } else {
        constraint = validator[j];
      }

      // Backwards compatability to existing constraint definitions as well as
      // a default value if no args are given
      if (!args) {
        args = [];
      }
      else if (!(args instanceof Array)){
        args = [args];
      }

      // Copy the arguments array into another array
      args = args.slice(0, args.length);

      // Add the field value as the first argument of the array
      args.unshift(field);

      // Default to the model error messages if message was provided on the field
      if (!errorMessage) {
        errorMessage = modelErrorMessages[j] || 'NO MESSAGE: ' + j;
      }

      // Provide a helpful error if the constraint was not a function
      if (typeof constraint !== 'function') {
        hasError = true;
        metadata[i].hasError = true;
        metadata[i].lastError = 'Validator constraint: ' + j;
        break;
      }

      // Set the error message and move on after the first error for this field
      else if (!constraint.apply(this, args)) {
        hasError = true;
        metadata[i].hasError = true;
        metadata[i].lastError = errorMessage;
        break;
      }
    }

    // When this is submodel array - validate each sub-object
    if (mapping && mapping.type === MAPPING_TYPES.SUBMODEL_ARRAY) {
      for (j in data[i]) {
        if (!data[i][j].isValid()) {
          hasError = true;
          metadata[i].hasError = true;
        }
      }
    }
  }

  // Loop through the data and sanitize any extra fields by deleting them
  for (i in data) {
    if (!definition[i] && i !== '__meta' && i !== 'prototype' && typeof data[i] !== 'function') {
      delete data[i];
    }
  }

  return hasError;
};

/**
 * Simple getter to figure out if the instance currently has an error.
 *
 * @param field A field reference in dot notation
 * @returns {Boolean}
 */
Instance.prototype.hasError = function (field) {
  var fieldMetadata;

  if (!field || typeof field !== 'string') {
    return this.__meta.hasError;
  }

  fieldMetadata = this.getChildWithDotNotation(field, this.__meta.fields);

  if (!fieldMetadata) {
    throw new Error("The requested field does not exists: " + field);
  }

  return fieldMetadata.hasError;
};


/**
 * Gets the error for a specific field.
 *
 * @param field A dot notation reference to a field
 */
Instance.prototype.getError = function (field) {
  var fieldMetadata;

  if (!field || typeof field !== 'string') {
    return null;
  }

  fieldMetadata = this.getChildWithDotNotation(field, this.__meta.fields);

  if (!fieldMetadata) {
    throw new Error("The requested field does not exists: " + field);
  }

  return fieldMetadata.lastError;
};

/**
 * Get all of the errors for this instance. Return null if no errors exist.
 *
 */
Instance.prototype.getErrors = function () {
  if (!this.hasError()) {
    return null;
  }

  var meta = this.__meta;
  var errorObject = {code: 400, errors: {instance: [], fields: {}}};
  this.recursivelyGetFieldErrors(
    meta.definition,
    meta.fields,
    this,
    errorObject.errors.fields
  );
  return errorObject;
};

/**
 *
 * @param definition
 * @param metadata
 * @param fieldErrors
 */
Instance.prototype.recursivelyGetFieldErrors = function (definition, metadata, data, fieldErrors) {
  var i, j;
  var childError;
  var currentFieldData;

  for (i in definition) {
    if (!metadata[i].hasError) {
      continue;
    }

    currentFieldData = (typeof data === 'undefined' || data === null) ? null : data[i];

    if (this.isSubDocumentDefinition(definition[i])) {
      fieldErrors[i] = {};

      if (metadata[i].lastError) {
        fieldErrors[i].error = metadata[i].lastError;
      }

      fieldErrors[i].childErrors = {};
      this.recursivelyGetFieldErrors(definition[i], metadata[i], currentFieldData, fieldErrors[i].childErrors);

    } else if ((definition[i] instanceof Array || definition[i].mapping && definition[i].mapping.type === MAPPING_TYPES.SUBMODEL_ARRAY) && metadata[i].hasError) {
      fieldErrors[i] = {};

      if (metadata[i].lastError) {
        fieldErrors[i].error = metadata[i].lastError;
      }

      for (j in data[i]) {
        childError = data[i][j].getErrors();

        if (!childError) {
          continue;
        }

        if (!fieldErrors[i].childErrors) {
          fieldErrors[i].childErrors = {};
        }

        fieldErrors[i].childErrors[j] = childError;
      }
    } else {
      fieldErrors[i] = metadata[i].lastError;
    }
  }
};

/**
 *
 * @param reference
 * @param object
 */
Instance.prototype.getChildWithDotNotation = function (reference, object) {
  var i, val, path = reference.split('.');

  val = object;
  for (i in path) {
    // The reference was invalid
    if (typeof val !== 'object') {
      return null;
    }

    val = val[path[i]];
  }

  return val;
};

/**
 * Use the helper function to get a child element using dot notation.
 *
 * @method get
 */
Instance.prototype.get = function (key) {
  return this.getChildWithDotNotation(key, this);
};



// DATA BINDING ================================================================


/**
 * Consume an object of raw data and bind them to the appropriate values on this
 * instance while updating the field metadata.
 *
 * @param data An object of raw data to bind
 * @param isUpdate Should set the hasChanged flag to true
 */
Instance.prototype.bind = function (data, isUpdate) {
  this.bindDataByDefinition(
    this.__meta.definition,
    this.__meta.fields,
    this,
    data,
    false,
    isUpdate
  );
};

/**
 * A recursive helper to bind the raw data to this instance object and set the
 * appropriate metadata flags.
 *
 * @param definition
 * @param metadata
 * @param target
 * @param data
 * @param resetAllFields
 * @param isUpdate
 */
Instance.prototype.bindDataByDefinition = function (definition, metadata, target, data, resetAllFields, isUpdate) {
  var i, j, submodel, tempInst;
  var isSubmodelArray;
  var mapping;
  var submodelPrimarykey;

  // There is nothing to do if the raw data is not an object
  if (typeof data !== 'object') {
    return;
  }

  for (i in definition) {
    if (this.isSubDocumentDefinition(definition[i])) {
      target[i] = target[i] || {};
      this.bindDataByDefinition(
        definition[i],
        metadata[i],
        target[i],
        data[i],
        resetAllFields,
        isUpdate
      );

      continue;
    }

    // New paradigm
    mapping = definition[i].mapping;

    // Skip bindings for virtual fields
    if (mapping && mapping.type === MAPPING_TYPES.VIRTUAL) {
      continue;
    }

    isSubmodelArray = (mapping && mapping.type === MAPPING_TYPES.SUBMODEL_ARRAY);


    if (isSubmodelArray && data[i]) {
      // Get the source object for this submodel array to find the primary key
      submodel = this.__meta.sources[mapping.source].source;
      submodelPrimarykey = submodel.primaryKey;

      if (!target[i]) {
        target[i] = [];
      }

      // Loop through any existing records and create a fast-lookup map by id
      // Also mark all of them for deletion
      var lookup = {};
      for (j in target[i]) {
        target[i][j].shouldDelete(true);
        lookup[target[i][j][submodelPrimarykey]] = target[i][j];
      }

      var id, instanceData;
      for (j in data[i]) {
        instanceData = data[i][j];
        id = String(instanceData[submodelPrimarykey]);

        // If the instance exists, update it, otherwise create a new instance and
        // push it into the target property
        if (id && lookup[id]) {
          tempInst = lookup[id];
        } else {
          tempInst = submodel.createInstance();
          target[i].push(tempInst);
        }

        tempInst.shouldDelete(false);
        tempInst.bind(instanceData, true);
      }

      // Mark the field as updated (if this an update)
      metadata[i].hasChanged = isUpdate;
      continue;
    }

    if ((typeof data[i] === 'undefined' || data[i] === null) && !resetAllFields) {
      continue;
    }

    // Do not bind the field if this is an attempt to modify the field and the
    // field is marked as read only
    if (definition[i].readOnly && isUpdate) {
      continue;
    }

    // Reset the value of the target object and its associated metadata
    target[i] = (definition[i].coerceType === 'function')
      ? definition[i].coerceType(data[i])
      : data[i];

    metadata[i].hasChanged = isUpdate; // Track changes if this is an update
    metadata[i].previousValue = data[i];
  }
};

/**
 * Description
 *
 * @param
 * @method method
 * @param
 * @returns
 */
Instance.prototype.bindFromSourceInstance = function (source, instance) {
  var meta = this.__meta;

  // Keep a reference to the bound instance in case we need to update or
  // delete
  meta.instances[source.name] = {
    instance: instance,
    source: meta.sources[source.name]
  };

  this.bindSourceInstanceToSelf(
    meta.definition,
    this,
    source,
    instance
  );
};

/**
 * A recursive helper htat
 *
 * @method method
 * @param {Object} definition A list of the fields on this object
 * @param {Object} target The target object to bind data to
 * @returns {Object}
 *   The bound target object
 * @private
 */
Instance.prototype.bindSourceInstanceToSelf = function (definitions, target, source, instance) {
  var i;
  var mapping;
  var data;
  var fieldName;
  var definition;

  // Do nothing if there is no data
  if (!instance) {
    return target;
  }

  for (i in definitions) {
    definition = definitions[i];


    // Recursively call this function if this is a sub-document field
    if (this.isSubDocumentDefinition(definition)) {
      target[i] = target[i] || {};

      this.bindSourceInstanceToSelf(
        definition,
        target[i],
        source,
        instance
      );

      continue;
    }

    mapping = definition.mapping || {};

    // Skip bindings for virtual fields
    if (mapping.type === MAPPING_TYPES.VIRTUAL) {
      continue;
    }

    // Only the primary instance can affect unmapped fields
    if (!mapping.source && !source.isPrimary) {
      continue;

      // The specified source in the mapping must match the name of this source
    } else if (mapping.source && mapping.type !== MAPPING_TYPES.MODEL_REFERENCE && mapping.source !== source.name) {
      continue;
    }

    // If the mapping type is a submodel property, just attach the entire instance
    if (mapping.type === MAPPING_TYPES.SUBMODEL_PROPERTY) {
      target[i] = instance;
      continue;
    }

    // Use an alias if one is specified
    fieldName = mapping.alias || i;

    // Use a getter on the source instance if one is available
    if (typeof instance.get === 'function') {
      data = instance.get(fieldName);
    } else {
      data = instance[fieldName];
    }


    // Do not unset an existing value
    if (typeof data === 'undefined') {
      continue;
    }

    // Use a deserializer to transform the data if necessary
    data = (data && mapping.deserialize) ? mapping.deserialize(data) : data;
    target[i] = (data) ? data : target[i];

    // Reset the value of the target object and its associated metadata
    data = target[i];

    if (typeof data !== 'undefined' && data !== null && typeof definition.coerceType === 'function') {
      target[i] = definition.coerceType(data);
    }
  }

  return target;
};


// SERIALIZATION ===============================================================


/**
 * Do a deep copy of this instance to return a plain javascript object based off
 * of this instance without any of the metadata properties.
 *
 */
Instance.prototype.toObject = function (view, fields) {
  var obj = {}, includeAll;
  fields = fields || this.__meta.view_fields;
  view = view || this.__meta.view;
  includeAll = (view === 'all');
  this.recursiveDeepCopy(this, obj, this.__meta.definition, view, '', fields, includeAll);
  return obj;
};

/**
 * A recursive helper to deep copy an object to an independent new object.
 *
 * @param source
 * @param target
 * @param definition
 * @param view
 * @param prefix
 * @param fields
 * @param includeAll Indicates that all fields in the object should be included
 */
Instance.prototype.recursiveDeepCopy = function (source, target, definition, view, prefix, fields, includeAll) {
  var i, j, shouldInclude, didSubmodelUpdate, didUpdate = false;
  var month;
  var day;
  var list;
  var meta;
  var serialized;
  var mapping;

  for (i in source) {
    if (!source.hasOwnProperty(i) || i === '__meta' || typeof source[i] === 'function' || !definition[i]) {
      continue;
    }

    shouldInclude = (
      includeAll ||
      (definition[i].views && definition[i].views[view]) ||
      fields[prefix + i]
    );

    // Always search through sub-document fields
    if (this.isSubDocumentDefinition(definition[i])) {
      target[i] = {};
      didSubmodelUpdate = this.recursiveDeepCopy(
        source[i],
        target[i],
        definition[i],
        view,
        prefix + i + '.',
        fields,
        shouldInclude
      );

      if (!didSubmodelUpdate) {
        delete target[i];
      } else {
        didUpdate = true;
      }

      continue;
    }

    // If it is not in the view or the fields list, then skip
    if (!shouldInclude) {
      continue;
    }

    // For arrays - if they are submodel docs, call toObject()
    if (definition[i].type === TYPES.ARRAY) {
      meta = null;
      serialized = [];


      // Check if this has the metadata wrapper or not
      if (source[i] instanceof Array) {
        list = source[i];
      } else {
        list = source[i].list;
        meta = source[i].meta;
      }

      for (j in list) {
        if (list[j] instanceof Instance) {
          serialized.push(list[j].toObject(view, fields));
        } else {
          serialized.push(list[j]);
        }

        didUpdate = true;
      }

      // Include the meta fields if any exist
      if (meta) {
        target[i] = {meta: meta, list: serialized};
      } else {
        target[i] = serialized;
      }
    } else if (definition[i].type === TYPES.DATE && source[i] instanceof Date) {
      month = (source[i].getUTCMonth() + 1);
      month = (month < 10) ? '0' + month : month;

      day = source[i].getUTCDate();
      day = (day < 10) ? '0' + day : day;

      target[i] = source[i].getFullYear() + '-' + month + '-' + day;
      didUpdate = true;
    } else {
      target[i] = source[i];
      didUpdate = true;
    }
  }

  // Add any virutal fields after adding existing fields from the source object
  for (i in definition) {
    shouldInclude = (
      includeAll ||
      (definition[i].views && definition[i].views[view]) ||
      fields[prefix + i]
    );

    if (!shouldInclude) {
      continue;
    }

    mapping = definition[i].mapping;
    if (mapping && mapping.type === MAPPING_TYPES.VIRTUAL) {
      // If this is a virtual field, use the getter function and call it in the
      // context of this instance object, pass in the global context as an argument
      target[i] = mapping.get.call(source, this);
      didUpdate = true;
    }
  }

  return didUpdate;
};



// CREATE / UPDATE / DELETE OPERATIONS =========================================


/**
 * This is a convenient way to call create or update depending on whether this
 * model has a system ID.
 *
 * @method save
 * @param callback {Function}
 * @returns {Object}
 */
Instance.prototype.save = function (callback) {
  if (this[this.__meta.primaryKey]) {
    return this.update(callback);
  } else {
    return this.create(callback);
  }
};

/**
 * Needed to define a common API method that was unlikely to be used by other
 * underlying ORM/ODM libraries, so this flushChanges() method just calls save()
 * in a consistent way.
 *
 * @method flushChanges
 */
Instance.prototype.flushChanges = Instance.prototype.save;

/**
 * Validate the data bound to this instance and then
 *
 * @method create
 * @param callback {function}
 */
Instance.prototype.create = function (callback) {
  if (!this.isValid()) {
    callback(this.getErrors());
    return;
  }

  var meta = this.__meta;

  // Find the fields to be saved
  var fieldsToSave = this.getUpdatedFields(meta.fields, meta.definition, this);

  // Find the primary source
  var primarySource = meta.primarySource;
  var sources = meta.sources;

  // Create the source instances that will need to be saved. A primary record
  // must always be created, so make sure the primary instance exists under its
  // own name and a 'primary' alias
  var instances = {
    primary: {
      instance: primarySource.source.createInstance(),
      source: primarySource
    }
  };
  instances[primarySource.source.name] = instances.primary;

  // Map field updates to source instances - this will create instances for
  // every source that needs saving and will ignore sources not used
  this.mapFieldsToSourceInstances(
    fieldsToSave,
    meta.definition,
    sources,
    instances
  );

  // Start saving with the primary instance
  var primaryInstance = instances.primary.instance;
  delete instances.primary;
  delete instances[primarySource.source.name];

  var saveDependentSourcesCallback = this.generateDependentSourcesClosure(
    primarySource.source,
    instances
  );

  primaryInstance.flushChanges(saveDependentSourcesCallback);

  // If the callback was specified, use that as the default callback
  this.setSourceOpCallback(callback);

  // Return the ability to set the callback in the form of .complete()
  return {
    done: this.setSourceOpCallback,
    complete: this.setSourceOpCallback
  };
};

/**
 * Loop through the data and drop them into data source buckets so that way the
 * updates can be applied to each data source.
 *
 * @TODO: What about submodels?
 *
 * @param data
 * @param definition
 * @param prefix
 * @param fieldMapping
 * @param result
 */
Instance.prototype.mapFieldsToSourceInstances = function (data, definition, sources, instances) {
  var i, key, mapping, serialized;
  var instanceWrapper;
  var instance;
  var sourceName;

  for (i in data) {

    if (typeof data[i] === 'undefined') {
      continue;
    }

    if (this.isSubDocumentDefinition(definition[i])) {
      this.mapFieldsToSourceInstances(
        data[i],
        definition[i],
        sources,
        instances
      );

      continue;
    }

    mapping = definition[i].mapping || {};

    // If there is no field mapping, place the value on the primary source instance
    sourceName = (mapping.source) ? mapping.source : 'primary';
    instanceWrapper = instances[sourceName];

    // Serialize the data if a searializer function is provided
    serialized = (mapping.serializer) ? mapping.serializer(data[i]) : data[i];

    if (!mapping.type || mapping.type === MAPPING_TYPES.FIELD) {
        // Change the name of the field to its source alias if one exists
      key = mapping.alias || i;

      if (!instanceWrapper) {
        instanceWrapper = {
          instance: sources[sourceName].source.createInstance(),
          source: sources[sourceName]
        };

        instances[sourceName] = instanceWrapper;
      }

      instance = instanceWrapper.instance;

      // Use a setter if one is provided
      if (typeof instance.set === 'function') {
        instance.set(key, serialized);
      } else {
        instance[key] = serialized;
      }

    } else if (mapping.type === MAPPING_TYPES.SUBMODEL_ARRAY) {
      // Add these to a special submodel array property
      if (!instanceWrapper) {
        instanceWrapper = {
          instances: [],
          source: sources[sourceName]
        };

        instances[sourceName] = instanceWrapper;
      }

      instanceWrapper.instances = instanceWrapper.instances.concat(serialized);

    } else if (mapping.type === MAPPING_TYPES.SUBMODEL_PROPERTY) {
      throw new Error('Submodel properties have not been implemented');

    } else {
      console.error(
        'Unknown mapping type: ' + mapping.type +
          ' for field: ' + i + ' on model: ' + this.__meta.modelName
      );
    }
  }
};

/**
 * Create a closure to bind the ID of the newly created record to the dependent
 * instances.
 *
 * @param primaryTable
 * @param dependents
 * @param callback
 * @returns {Function}
 */
Instance.prototype.generateDependentSourcesClosure = function (primarySource, instances) {
  var self = this;

  return function (err, primaryInstance) {
    if (err) {
      self.failSourceOp(err);
      return;
    }

    self.bindFromSourceInstance(primarySource, primaryInstance);

    var i;
    var j;
    var instance;
    var source;
    var submodelArrayInstances;

    // Loop through all the sources and save them one at a time
    for (i in instances) {
      instance = instances[i].instance;
      source = instances[i].source;

      // This is a submodel array that needs to be initiated for each instance
      if (!instance) {
        submodelArrayInstances = instances[i].instances;

        for (j in submodelArrayInstances) {
          instance = submodelArrayInstances[j];

          self.startSourceOp();

          instance.set(source.foreign_key, self[self.__meta.primaryKey]);

          submodelArrayInstances[j].flushChanges(self.generateSourceCreateCallback(source, self.finishSourceOp));
        }

        continue;
      }

      // Set the foreign key for this dependent source
      instance.set(source.foreign_key, self[self.__meta.primarykey]);

      self.startSourceOp();
      instance.flushChanges(self.generateSourceCreateCallback(source, self.finishSourceOp));
    }

    // Make sure at least one operation occurs
    self.startSourceOp();
    self.finishSourceOp();
  };
};

/**
 * Generate a callback function after the
 *
 * @method generateSourceReadCallback
 * @param source {AbstractSource}
 * @param {function} callback
 * @returns {function}
 */
Instance.prototype.generateSourceCreateCallback = function (source, callback) {
  var self = this;

  return function (err, instance) {
    if (err) {
      self.failSourceOp(err);
      return;
    }

    self.bindFromSourceInstance(source, instance);
    callback();
  };
};

/**
 * Update the object by accessing the ORM instances embedded in this object after
 * validating that the updates are OK.
 *
 */
Instance.prototype.update = function (callback) {
  if (!this.isValid()) {
    callback(this.getErrors());
    return;
  }

  var self = this;
  var meta = this.__meta;

  // Find the fields to be saved
  var fieldsToSave = this.getUpdatedFields(meta.fields, meta.definition, this);

  // Find the primary source
  var i;
  var j;
  var primarySource = meta.primarySource;
  var sources = meta.sources;
  var sourceInfo;
  var source;
  var instance;
  var instanceWrapper;
  var submodelArrayInstances;
  var primaryKey = meta.primaryKey;

  // Create the source instances that will need to be saved. A primary record
  // must always be created, so make sure the primary instance exists under its
  // own name and a 'primary' alias
  var instances = meta.instances;

  instances.primary = instances[primarySource.source.name];

  if (!instances.primary) {
    instances.primary = {
      instance: primarySource.source.createInstance(),
      source: primarySource
    };
  }

  // Map field updates to source instances - this will create instances for
  // every source that needs saving and will ignore sources not used
  this.mapFieldsToSourceInstances(
    fieldsToSave,
    meta.definition,
    sources,
    instances
  );

  // Prevent the primary instance from being saved twice
  delete instances.primary;

  // If the callback was specified, use that as the default callback
  this.setSourceOpCallback(callback);

  // Loop through all the tables and save them in parallel
  for (i in instances) {
    instanceWrapper = instances[i];
    instance = instanceWrapper.instance;
    sourceInfo = instanceWrapper.source;
    source = sourceInfo.source;

    // This is a submodel array that needs to be initiated for each instance
    if (!instance) {
      submodelArrayInstances = instances[i].instances;

      for (j in submodelArrayInstances) {
        instance = submodelArrayInstances[j];
        instance.set(source.foreignKey, this[primaryKey]);

        if (instance.shouldDelete()) {
          self.startSourceOp();
          instance.remove(self.generateSourceCreateCallback(source, self.finishSourceOp));
        } else if (instance.isModified()) {
          self.startSourceOp();
          instance.flushChanges(self.handleSourceOpCompletion);
        }
      }

      continue;
    }

    // Set the foreign key on non-primary sources
    if (!sourceInfo.is_primary) {
      instance.set(source.foreignKey, this[primaryKey]);
    }

    // Only update the instance if a field has changed
    if (instance.isModified()) {
      self.startSourceOp();
      instance.flushChanges(self.generateSourceCreateCallback(source, self.finishSourceOp));
    }
  }

  // Make sure at least one operation occurs after any callback setting has been
  // completed
  setImmediate(function () {
    self.startSourceOp();
    self.finishSourceOp();
  });

  // Return the ability to set the callback in the form of .complete()
  return {
    done: this.setSourceOpCallback,
    complete: this.setSourceOpCallback
  };
};


/**
 * Delete each of the entries in the table, leaving the primary table for last
 *
 */
Instance.prototype.remove = function (callback) {
  var self = this;
  var meta = this.__meta;

  var i;
  var instances = meta.instances;
  var instanceWrapper;
  var instance;
  var sourceInfo;
  var source;

  var deletePrimarySourceCallback;
  var finalCallbackSetter;

  for (i in instances) {
    instanceWrapper = instances[i];
    instance = instanceWrapper.instance;
    sourceInfo = instanceWrapper.source;
    source = sourceInfo.source;

    // Delete the primary instance last
    if (meta.sources[source.name].is_primary) {
      deletePrimarySourceCallback = this.generateDeletePrimarySourceCallback(instance, callback);
      this.setSourceOpCallback(deletePrimarySourceCallback);

      // Provide a promise/async style interface to allow for .complete() chain
      finalCallbackSetter = deletePrimarySourceCallback.finalCallbackSetter;
      continue;
    }

    // Destroy this data source instance
    this.startSourceOp();
    instance
      .destroy()
      .complete(this.handleSourceOpCompletion);
  }

  // Ensure that at least one operation finishes
  setImmediate(function () {
    self.startSourceOp();
    self.finishSourceOp();
  });

  return finalCallbackSetter;

  // @TODO: Do not delete from sub-models, too difficult right now...
  // @TODO: Should just make sub-model deletion a async task
};

/**
 * Available for backwards compatability
 *
 * @method destroy
 * @deprecated
 */
Instance.prototype.destroy = Instance.prototype.remove;


/**
 *
 * @param instance
 * @param callback
 */
Instance.prototype.generateDeletePrimarySourceCallback = function (instance, callback) {
  var finalCallback = callback;

  var deletePrimarySourceCallback = function (err) {
    if (err) {
      finalCallback(err);
      return;
    }

    instance
      .destroy()
      .complete(finalCallback);
  };

  // Provide a way to asynchronously set reset the callback to
  deletePrimarySourceCallback.finalCallbackSetter = {
    done: function (cb) {
      finalCallback = cb;
    },
    complete: function (cb) {
      finalCallback = cb;
    }
  };

  return deletePrimarySourceCallback;
};

module.exports = Instance;
