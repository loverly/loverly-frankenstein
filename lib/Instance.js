/*******************************************************************************
 *
 * Instance.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var MAPPING_TYPES = require('./FieldMappingTypes');
var SOURCE_MAPPING_TYPES = require('./SourceMappingTypes');

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
var Instance = function (model) {
  var self = this;
  var meta;

  // Wrap all instance data in a __meta property that no one should access
  this.__meta = {};
  meta = this.__meta;

  meta.modelName = model.name;
  meta.definition = model.definition;

  meta.isNextGenModel = model.isNextGenModel;

  meta.primarySource = model.primarySource;
  meta.sources = model.sources;

  if (meta.isNextGenModel) {
    meta.instances = {};
  } else {
    meta.instances = {"databases": {}, "models": {}};  
  }
  
  meta.mapping = model.mapping;  // DEPRECATED

  // Submodel properties
  meta.isSubmodel = model.isSubmodel;
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
  this.check = model.validator.check;


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
    console.error(
      'Error in source operation for an instance of ' + meta.modelName +
        ' failed with error: ' + JSON.stringify(err)
    );

    // Short circuit the failure if we have already failed this operation
    if (meta.sourceOp.isFailed) {
      console.debug('Operation already failed')
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
};

/**
 * Store a dictionary of error messages for the various errors
 *
 */
Instance.prototype.ERROR_MSGS = {
  notNull: 'This field is required',
  extraField: 'This field is not a part of this model',
  len: 'There were too many or too few characters included',
  isIn: "This field is restricted to specified values"
};

/**
 * The function that should be called once the operation count reaches 0.  The
 * arity of the function should be 2, with the first argument being a potential
 * error.
 *
 * @param cb
 */
Instance.prototype.setSourceOpCallback = function (cb) {
  this.__meta.sourceOp.callback = cb;
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
    if (this.isSubDocumentDefinition(definition[i])) {
      metadata[i] = {};
      this.createFieldMetadata(definition[i], metadata[i]);
    } else {
      metadata[i] = {
        hasChanged: false,
        hasError: false,
        lastError: '',
        previousValue: null
      };
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



// STATE MANAGEMENT ============================================================


/**
 * Create a virtual property with a custom getter that mirrors the sequelize.js
 * DAO object's isDirty property.  An indicator of whether or not this instance
 * has been modified.
 *  
 * @property isDirty
 * @type {boolean}
 */
Object.defineProperty(Instance.prototype, 'isDirty', {
  get: function() {
    var updatedFields = this.getUpdatedFields();
    return !!updatedFields || false;
  }
});

/**
 * Search through the metadata to find fields that have been updated.
 *
 * @param fieldMetadata
 * @param definition
 * @param data
 */
Instance.prototype.getUpdatedFields = function (fieldMetadata, definition, data) {
  var i
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
  if (this.doDocumentFieldsHaveError(this.__meta.definition, this.__meta.fields, this)) {
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

  hasError = false;

  for (i in definition) {
    if (this.isSubDocumentDefinition(definition[i])) {
      subdocErrors = this.doDocumentFieldsHaveError(definition[i], metadata[i], data[i]);

      // Flag an error if there was an error in the subdoc
      hasError = hasError || subdocErrors;
      continue;
    }

    // When this is submodel array - validate each sub-object
    if (definition[i] instanceof Array) {
      for (j in data[i]) {
        if (!data[i][j].isValid()) {
          hasError = true;
          metadata[i].hasError = true;
        }
      }
    }

    // Reset the field - before validating
    metadata[i].hasError = false;

    constraints = definition[i].constraints;
    field = (typeof data === 'object') ? data[i] : null;

    // Check if we are attempting to create an object without a required field
    // and no default value
    if (typeof field === 'undefined' || field === null) {
      if (typeof definition[i].defaultValue !== 'undefined') {

        // If there is a function to generate the value, use it
        data[i] = (typeof definition[i].defaultValue === 'function') 
          ? definition[i].defaultValue()
          : definition[i].defaultValue;

      } else if (definition[i].required) {
        hasError = true;
        metadata[i].hasError = true;
        metadata[i].lastError = this.ERROR_MSGS.notNull;
      }

      continue;
    }

    // Loop through the constraints and make sure that the validation outcomes
    // match the constraint values
    var validator;
    for (j in constraints) {
      try {
        validator = this.check(field, this.ERROR_MSGS[j]);

        // Apply the constraint arguments if they are available
        if (constraints[j] instanceof Array) {
          validator[j].apply(validator, constraints[j]);
        } else {
          validator[j]();
        }
      } catch (e) {
        // Set the error message and move on after the first error for this field
        hasError = true;
        metadata[i].hasError = true;
        metadata[i].lastError = e.message;
        break;
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

  for (i in definition) {
    if (this.isSubDocumentDefinition(definition[i])) {
      fieldErrors[i] = {};
      this.recursivelyGetFieldErrors(definition[i], metadata[i], data[i], fieldErrors[i]);
    } else if (definition[i] instanceof Array) {
      fieldErrors[i] = {};
      for (j in data[i]) {
        fieldErrors[i][j] = data[i][j].getErrors();
      }
    } else if (metadata[i].hasError) {
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



// DATA BINDING ================================================================


/**
 * Consume an object of raw data and bind them to the appropriate values on this
 * instance while updating the field metadata.
 *
 * @param data An object of raw data to bind
 * @param isUpdate Should set the hasChanged flag to true
 */
Instance.prototype.bind = function (data, isUpdate) {
  this.bindDataByDefinition(this.__meta.definition, this.__meta.fields, this, data, false, isUpdate);
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

  // There is nothing to do if the raw data is not an object
  if (typeof data !== 'object') {
    return;
  }

  for (i in definition) {
    if (this.isSubDocumentDefinition(definition[i])) {
      target[i] = {};
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

    // This is a sub-document array - we assume that these are only allowed at
    // the top level
    // @TODO: This could cause problems with more complex documents
    if (definition[i] instanceof Array && this.__meta.mapping.fields[i].type === MAPPING_TYPES.SUBMODEL_ARRAY) {
      if (!target[i]) {
        target[i] = [];  
      }

      // Loop through any existing records and create a fast-lookup map by id
      // Also mark all of them for deletion
      var lookup = {};
      for (j in target[i]) {
        target[i][j].shouldDelete(true);
        lookup[target[i][j].id] = target[i][j];
      }
      
      submodel = this.__meta.sources.models[this.__meta.mapping.fields[i].model].model;

      var id, instanceData;
      for (j in data[i]) {
        instanceData = data[i][j];
        id = String(instanceData.id);

        // If the instance exists, update it, otherwise create a new instance and
        // push it into the target property
        if (id && lookup[id]) {
          tempInst = lookup[id];
        } else {
          tempInst = submodel.createInstance();
          target[i].push(tempInst);
        }
        
        tempInst.shouldDelete(false);
        tempInst.bind(instanceData, isUpdate);
      }

      // Mark the field as updated (if this an update)
      metadata[i].hasChanged = isUpdate; 
      continue;
    }

    if (!data[i] && !resetAllFields) {
      continue;
    }

    // Do not bind the field if this is an attempt to modify the field and the
    // field is marked as read only
    if (definition[i].readOnly && isUpdate) {
      continue;
    }

    // Reset the value of the target object and its associated metadata
    target[i] = data[i];
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
    source: source
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
Instance.prototype.bindSourceInstanceToSelf = function (definition, target, source, instance) {
  var i;
  var mapping;
  var data;
  var fieldName;

  // Do nothing if there is no data
  if (!instance) {
    return target;
  }

  for (i in definition) {

    // Recursively call this function if this is a sub-document field
    if (this.isSubDocumentDefinition(definition[i])) {
      target[i] = target[i] || {};

      this.bindSourceInstanceToSelf(
        definition[i],
        target[i],
        source,
        instance
      );

      continue;
    }

    mapping = definition[i].mapping || {};

    // The specified source in the mapping must match the name of this source
    if (mapping.source && mapping.source !== source.name) {
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
  }

  return target;
};


/**
 * Take an ORM instance object and map it to this instance based on the mapping
 * definition.
 *
 * @param definition
 * @param mapPrefix
 * @param table
 * @param ormInstance
 * @deprecated As of v0.0.13
 */
Instance.prototype.bindOrmInstance = function (table, ormInstance) {
  var meta = this.__meta;
  this.bindOrmInstanceToObject(
    meta.definition,
    '',
    meta.mapping.fields,
    this,
    table,
    ormInstance
  );

  // Set the ORM instance object into this instance for updates later
  if (!meta.instances.databases[table.database]) {
    meta.instances.databases[table.database] = {"tables": {}};
  }

  meta.instances.databases[table.database].tables[table.name] = {
    hasChanged: false,
    instance: ormInstance
  };
};

/**
 *  Take the new instance object, the mapping definition, and the orm instance
 *  and map the ormInstance data to this object
 *  
 * @deprecated As of v0.0.13
 */
Instance.prototype.bindOrmInstanceToObject = function (definition, mapPrefix, fieldMappings, instance, table, ormInstance) {
  var i;
  var mapping;
  var db = table.database;
  var name = table.name;
  var isPrimary = table.isPrimary;
  var data;
  var key;

  // Do nothing if there is no ORM instance
  if (!ormInstance) {
    return instance;
  }

  for (i in definition) {
    // If a field mapping exists, the database and table name must match for
    // the mapping to have any effect
    mapping = fieldMappings[mapPrefix + i];

    if (mapping && (mapping.database !== db || mapping.table !== name)) {
      continue;
    }

    // Recursively call this function if this is a sub-document field
    if (this.isSubDocumentDefinition(definition[i])) {
      instance[i] = instance[i] || {};

      this.bindOrmInstanceToObject(
        definition[i],
        mapPrefix + i + '.',
        fieldMappings,
        instance[i],
        table,
        ormInstance
      );
      continue;
    }

    // If there is no mapping for this field, only the primary table can affect it
    if (!mapping && !isPrimary) {
      continue;
    }

    // Use an alias if one is specified
    key = (mapping && mapping.alias) ? mapping.alias : i;
    data = (ormInstance.get) ? ormInstance.get(key) : ormInstance[key];

    // Use a deserializer to transform ORM data if necessary
    data = (data && mapping && mapping.deserializer)
      ? mapping.deserializer(data)
      : data;

    instance[i] = data;
  }

  return instance;
};



// SERIALIZATION ===============================================================


/**
 * Do a deep copy of this instance to return a plain javascript object based off
 * of this instance without any of the metadata properties.
 *
 */
Instance.prototype.toObject = function (view, fields) {
  var obj = {}, includeAll;
  fields = fields || {};
  view = view || "default";
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

  for (i in source) {
    if (!source.hasOwnProperty(i) || i === '__meta' || typeof source[i] === 'function') {
      continue;
    }

    shouldInclude = (
      includeAll || 
      (definition[i].views && definition[i].views[view]) || 
      fields[prefix + i]
    );


    // Check if it should be included in this view
    // DEPRECATED: for backwards compatibility
    if (!shouldInclude) {
      for (j in definition[i].views) {
        if (definition[i].views && definition[i].views[j] === view) {
          shouldInclude = true;
        }
      }
    }


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
    if (source[i] instanceof Array) {
      target[i] = [];

      for (j in source[i]) {
        if (source[i][j] instanceof Instance) {
          target[i][j] = source[i][j].toObject(view, fields);
        } else {
          target[i][j] = source[i][j];
        }

        didUpdate = true;
      }
    } else {
      target[i] = source[i];
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
  if (this.id) {
    return this.update(callback);
  } else {
    return this.create(callback);
  }
};


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

  if (!this.__meta.isNextGenModel) {
    this.create_deprecated(callback);
  }

  var meta = this.__meta;

  // Find the fields to be saved
  var fieldsToSave = this.getUpdatedFields(meta.fields, meta.definition, this);

  // Find the primary source
  var i;
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
  instances[primarySource.name] = instances.primary;

  // Map field updates to source instances - this will create instances for 
  // every source that needs saving and will ignore sources not used
  this.mapFieldsToSourceInstances(
    fieldsToSave,
    meta.definition,
    sources,
    instances
  );

  // Start saving with the primary instance
  var primaryInstance = instances['primary'].instance;
  delete instances['primary'];
  delete instances[primarySource.name];

  var saveDependentSourcesCallback = this.generateDependentSourcesClosure(
    primarySource.source,
    instances
  );

  primaryInstance.save().done(saveDependentSourcesCallback);

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
  var fieldName;
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

    if (!mapping.type || mapping.type === MAPPING_TYPES.FIELD) {
        // Change the name of the field to its source alias if one exists
      key = mapping.alias || i;

      // Serialize the data if a searializer function is provided
      serialized = (mapping.serializer) ? mapping.serializer(data[i]) : data[i];

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
        instance[i] = serialized;
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

      instanceWrapper.instances = instanceWrapper.instances.concat(data[i]);

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

    // Loop through all the tables and save them one at a time
    for (i in instances) {
      instance = instances[i].instance;
      source = instances[i].source;
      instance[source.foreign_key] = primaryInstance.id;

      // This is a submodel array that needs to be initiated for each instance
      if (!instance) {
        for (j in instances[i].instances) {
          self.startSourceOp();
          instances[i].instances[j]
            .save()
            .complete(self.generateSourceCreateCallback(source, self.finishSourceOp));
        }
      }

      self.startSourceOp();
      instance
        .save()
        .complete(self.generateSourceCreateCallback(source, self.finishSourceOp));
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
  }
};


/**
 * Validate the data bound to this instance and then
 *
 * @method create_deprecated
 * @param callback
 * @deprecated 
 */
Instance.prototype.create_deprecated = function (callback) {
  if (!this.isValid()) {
    callback(this.getErrors());
    return;
  }

  if (!this.__meta.isNextGenModel) {

  }

  var tables = this.getRecordsToCreate();
  var dependentSubmodels = this.getSubmodelInstancesAndMappingInfo();

  // Create a callback that will create 
  var createDependentRecordsCallback = this.generateDependentRecordsClosure(
    tables.primary.table, 
    tables.records, 
    dependentSubmodels,
    callback
  );

  // Kick off the chain of events by creating the primary record, use the sourceOp
  // counter to handle any errors
  this.setSourceOpCallback(callback);
  tables.primary.instance
    .save()
    .error(this.failSourceOp)
    .success(createDependentRecordsCallback);
};


/**
 *
 *
 * @method getDependentOrmRecordsToCreate
 * @returns {Object}
 *  A hash of the primary instance/table and the dependent tables which we will
 *  modify after generating the primary record.
 */
Instance.prototype.getRecordsToCreate = function () {
  var meta = this.__meta;
  var fieldsToUpdate = this.getUpdatedFields(meta.fields, meta.definition, this);
  var mappedFields = {"default": {}, "databases": {}, "models": {}};

  // Loop through the mappings to see which changed fields map to which instance
  this.mapFieldUpdatesToInstances(
    fieldsToUpdate,
    meta.definition,
    '',
    meta.mapping.fields,
    mappedFields
  );

  // Now that we have all the fields mapped to the data source they belong to
  // we can begin updating those tables starting with the primary
  var dbInfo = meta.mapping.sources.databases;
  var dbs = meta.sources.databases;
  var i, j, k, OrmModel, instance, fields, hasFieldToUpdate, isPrimary;
  var primaryInstance, primaryTable;
  var dependentTables = [];

  for (i in dbs) {
    for (j in dbs[i].tables) {
      OrmModel = dbs[i].tables[j].model;
      isPrimary = dbInfo[i].tables[j].is_primary;
      instance = {};
      hasFieldToUpdate = false;

      // Only add ORM instances that have actually been updated
      if (mappedFields.databases[i] && mappedFields.databases[i].tables[j]) {
        // Update the fields in the ORM layer
        fields = mappedFields.databases[i].tables[j];
        for (k in fields) {
          instance[k] = fields[k];
          hasFieldToUpdate = true;
        }
      }

      // Update the default fields on the primary db
      if (isPrimary && mappedFields['default']) {
        for (k in mappedFields['default']) {
          instance[k] = mappedFields['default'][k];
          hasFieldToUpdate = true;
        }
      }

      if (isPrimary || hasFieldToUpdate) {
        // Create the ORM instance from the raw data
        instance = OrmModel.build(instance);
      }

      if (isPrimary) {
        primaryInstance = instance;
        primaryTable = dbs[i].tables[j];
      } else if (hasFieldToUpdate) {
        dependentTables.push({
          instance: instance,
          info: dbInfo[i].tables[j],
          table: dbs[i].tables[j]
        });
      }
    }
  }

  return {
    primary: {instance: primaryInstance, table: primaryTable}, 
    records: dependentTables
  };
};

/**
 *
 *
 * @method getDependentSubmodelsToCreate
 * @returns {Array}
 *  An array of submodels to be created after the primary record is created
 */
Instance.prototype.getSubmodelInstancesAndMappingInfo = function () {
  // Loop through the submodels and create them
  var meta = this.__meta;
  var submodels = meta.sources.models;
  var submodelMetainfo = meta.mapping.sources.models;
  var fieldMetainfo = meta.mapping.fields;

  var fieldToSubmodel = {};
  var dependentSubmodels = [];
  var fk;
  var field;
  var model;

  // Loop through the field mappings to find all the submodel array fields
  // and map them to their models
  for (i in fieldMetainfo) {
    if (fieldMetainfo[i].type === MAPPING_TYPES.SUBMODEL_ARRAY) {
      fieldToSubmodel[fieldMetainfo[i].model] = i;
    }
  }

  // Loop through all the submodels and build the dependent instances to save
  for (i in submodelMetainfo) {
    fk = submodelMetainfo[i].foreign_key;
    instances = this[fieldToSubmodel[i]];
    dependentSubmodels.push({
      foreign_key: fk, 
      field_name: fieldToSubmodel[i],
      instances: instances
    });
  }

  return dependentSubmodels;
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
Instance.prototype.generateDependentRecordsClosure = function (primaryTable, dependentTables, dependentSubmodels, callback) {
  var self = this;

  return function (primaryInstance) {
    var i, j, instance, info, table;

    self.bindOrmInstance(primaryTable, primaryInstance);
    self.setSourceOpCallback(callback);

    // Loop through all the tables and save them one at a time
    for (i in dependentTables) {
      instance = dependentTables[i].instance;
      info = dependentTables[i].info;
      table = dependentTables[i].table;
      instance[info.foreign_key] = primaryInstance.id;

      self.startSourceOp();
      instance
        .save()
        .error(self.failSourceOp)
        .success(self.generateOrmBindingClosure(table, self.finishSourceOp));
    }

    // Loop through all of the submodel instances, set the foreign key, and 
    // save them
    for (i in dependentSubmodels) {
      var fk = dependentSubmodels[i].foreign_key;
      var instances = dependentSubmodels[i].instances;

      for (j in instances) {
        var bindData = {};
        bindData[fk] = primaryInstance.id;
        instances[j].bind(bindData, true);

        self.startSourceOp();
        instances[j].create(function (err) {
          if (err) {
            self.failSourceOp(err);
          } else {
            self.finishSourceOp();
          }
        });
      }
    }

    // Make sure at least one operation occurs
    self.startSourceOp();
    self.finishSourceOp();
  };
};

/**
 * As we create new records in the database, bind the returned orm instance data
 * to this object.
 *
 * @param table
 * @param callback
 * @returns {Function}
 */
Instance.prototype.generateOrmBindingClosure = function (table, callback) {
  var self = this;
  return function (instance) {
    self.bindOrmInstance(table, instance);
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

  if (!this.__meta.isNextGenModel) {
    this.update_deprecated(callbacks);
    return;
  }

  var self = this;
  var meta = this.__meta;

  // Find the fields to be saved
  var fieldsToSave = this.getUpdatedFields(meta.fields, meta.definition, this);

  // Find the primary source
  var i;
  var primarySource = meta.primarySource;
  var sources = meta.sources;
  var source;
  var instance;

  // Create the source instances that will need to be saved. A primary record
  // must always be created, so make sure the primary instance exists under its
  // own name and a 'primary' alias
  var instances = meta.instances;

  instances.primary = instances[primarySource.source.name];

  if (!instances.primary) {
    instances.primary = {
      instance: primarySource.source.createInstance(),
      source: primarySource
    }
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
    instance = instances[i].instance;
    source = instances[i].source;
    instance[source.foreign_key] = this.id;

    // This is a submodel array that needs to be initiated for each instance
    if (!instance) {
      for (j in instances[i].instances) {
        self.startSourceOp();
        instances[i].instances[j]
          .save()
          .complete(self.generateSourceCreateCallback(source, self.finishSourceOp));
      }
    }

    // Only update the instance if a field has changed
    if (instance.isDirty) {
      self.startSourceOp();
      instance
        .save(instance.changed())
        .complete(self.generateSourceCreateCallback(source, self.finishSourceOp));  
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
 *
 * @method update_deprecated
 * @param  {Function} callback
 * @return {undefined}
 * @deprecated 
 */
Instance.prototype.update_deprecated = function (callback) {
  var self = this;
  var meta = this.__meta;
  var updatedFields = this.getUpdatedFields(meta.fields, meta.definition, this);
  var mappedFields = {"default": {}, "databases": {}, "models": {}};

  // Loop through the mappings to see which changed fields map to which instance
  this.mapFieldUpdatesToInstances(
    updatedFields,
    meta.definition,
    '',
    meta.mapping.fields,
    mappedFields
  );

  // Now that we have all the fields mapped to the data source they belong to
  // we can begin updating those tables starting with the primary
  var dbInfo = meta.mapping.sources.databases;
  var dbs = meta.instances.databases;
  var i, j, k, instance, fields, fieldsToUpdate;

  this.setSourceOpCallback(callback);

  for (i in dbs) {
    for (j in dbs[i].tables) {
      instance = dbs[i].tables[j].instance;
      fieldsToUpdate = [];

      // Only add ORM instances that have actually been updated
      if (mappedFields.databases[i] && mappedFields.databases[i].tables[j]) {
        // Update the fields in the ORM layer
        fields = mappedFields.databases[i].tables[j];
        for (k in fields) {
          instance[k] = fields[k];
          fieldsToUpdate.push(k);
        }
      }

      // Update the default fields on the primary db
      if (dbInfo[i].tables[j].is_primary && mappedFields['default']) {
        for (k in mappedFields['default']) {
          instance[k] = mappedFields['default'][k];
          fieldsToUpdate.push(k);
        }
      }

      if (fieldsToUpdate.length) {
        // Kickoff the update process
        this.startSourceOp();
        instance
          .save(fieldsToUpdate)
          .success(this.finishSourceOp)
          .error(this.failSourceOp);
      }
    }
  }

  // Find all dependent submodels
  var submodels = this.getSubmodelInstancesAndMappingInfo();
  var fieldName, instances, foreignKey;
  for (i in submodels) {
    foreignKey = submodels[i].foreign_key;
    fieldName = submodels[i].field_name;
    instances = submodels[i].instances;


    // The fields was not updated, skip this submodel
    if (!updatedFields[fieldName]) {
      continue;
    }

    // Ensure that the parent ID is set and either save or delete the records
    var bindData;
    for (j in instances) {
      this.startSourceOp();

      // Bind the foreignKey to the instance
      var bindData = {};
      bindData[foreignKey] = this.id;
      instances[j].bind(bindData, true);

      if (instances[j].shouldDelete()) {
        instances[j].destroy(this.handleSourceOpCompletion);
      } else if (instances[j].id) {
        instances[j].update(this.handleSourceOpCompletion);
      } else {
        instances[j].create(this.handleSourceOpCompletion);
      }
    }
  }

  // Make sure at least one operation occurs
  this.startSourceOp();
  this.finishSourceOp();
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
Instance.prototype.mapFieldUpdatesToInstances = function (data, definition, prefix, fieldMapping, result) {
  var i, key, mapping, serialized;

  for (i in data) {
    if (this.isSubDocumentDefinition(definition[i])) {
      this.mapFieldUpdatesToInstances(
        data[i],
        definition[i],
        prefix + i + '.',
        fieldMapping,
        result
      );
      continue;
    }

    mapping = fieldMapping[prefix + i];

    if (!mapping) {
      result['default'][i] = data[i];
      continue;
    }

    if (mapping.type === MAPPING_TYPES.DB_FIELD) {
      // Create the correct hierarchy for updated fields within ORM tables
      if (!result.databases[mapping.database]) {
        result.databases[mapping.database] = {};
      }

      if (!result.databases[mapping.database].tables) {
        result.databases[mapping.database].tables = {};
      }

      if (!result.databases[mapping.database].tables[mapping.table]) {
        result.databases[mapping.database].tables[mapping.table] = {};
      }

      // Change the name of the field to its ORM alias if one exists
      key = mapping.alias || i;

      // Serialize the data for the ORM
      serialized = (mapping.serializer) ? mapping.serializer(data[i]) : data[i];
      result.databases[mapping.database].tables[mapping.table][key] = serialized;

    // For submodel arrays, pass all of the data to the result so the updates
    // can be processed for each of the submodel instances
    } else if (mapping.type === MAPPING_TYPES.SUBMODEL_ARRAY) {
      result.models[mapping.model] = data[i];
    } else {
      result['default'][i] = data[i];
    }
  }
};

/**
 * Delete each of the entries in the table, leaving the primary table for last
 *
 */
Instance.prototype.destroy = function (callback) {
  var meta = this.__meta;
  var dbInfo = meta.mapping.sources.databases;
  var dbs = meta.instances.databases;
  var i, j, instance;

  // Delete all of the database records for one-to-one mappings
  for (i in dbs) {
    for (j in dbs[i].tables) {
      instance = dbs[i].tables[j].instance;

      // Make sure that the primary record is deleted last
      if (dbInfo[i].tables[j].is_primary) {
        this.setSourceOpCallback(this.generateDeletePrimaryRecordHandler(instance, callback));
        continue;
      }

      // Kickoff the update process
      this.startSourceOp();
      instance
        .destroy()
        .success(this.finishSourceOp)
        .error(this.failSourceOp);
    }
  }

  // Ensure that at least one operation finishes
  this.startSourceOp();
  this.finishSourceOp();

  // @TODO: Do not delete from sub-models, too difficult right now...
  // @TODO: Should just make sub-model deletion a async task
};

/**
 *
 * @param ormInstance
 * @param callback
 */
Instance.prototype.generateDeletePrimaryRecordHandler = function (ormInstance, callback) {
  return function (err) {
    if (err) {
      callback(err);
      return;
    }

    ormInstance
      .destroy()
      .success(function () {
        callback(null, true);
      })
      .error(callback);
  };
};

module.exports = Instance;