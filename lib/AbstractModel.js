/*******************************************************************************
 *
 * AbstractModel.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractSource = require('./AbstractSource.js');
var Instance = require('./Instance.js');

var TYPES = require('./Types');
var FIELD_MAPPING_TYPES = require('./FieldMappingTypes');
var SOURCE_MAPPING_TYPES = require('./SourceMappingTypes');

/**
 * Define an arbitrarily complex model that maps to one or more sources of data.
 *
 * @class AbstractModel
 * @constructor
 * @extends {AbstractSource}
 */
var AbstractModel = function () {
  this.name = this.name || 'Abstract';
  this.pluralizedName = this.name.toLowerCase() + 's';

  // Set a primary key that uniquely identifies the model, defaults to ID
  this.primaryKey = this.primaryKey || 'id';

  // Properties for dealing with a submodel - if this is a submodel, reads occur
  // via a foreign key
  this.isSubmodel = false;
  this.foreignKey = '';

  // A constructor for a model instance - extends Instance
  this.Instance = Instance;

  // Node validator that will be set through property injection
  this.validator = null;

  // The "ideal" entity definition - independent of the underlying data representation
  this.definition = this.definition || {
    "example1": {
      "type": "STRING",
      "default": "value",
      "required": false,
      "views": ["basic"],
      "constraints": {
        "len": [1, 3]
      },
      "mapping": {
        "type": FIELD_MAPPING_TYPES.DB_FIELD
      }
    },
    "example2": {"type": "STRING", "default": "value"},
    "complexField": {
      "field1": {"type": "STRING", "constraints": {"isEmail": true}}
    },
    "oneToManyField": []
  };

  /**
   * A hash of view settings - default options that are associated with views.
   *
   * @property views
   * @type {Object}
   */
  this.views = this.views || {
    'example': {
      fields: [],
      should_resolve_references: true,
      should_include_meta: true,
      should_disable_foreign_key: false,
      limit: 25,
      offset: 0,
      sort_field: 'approval_status',
      sort_order: 'DESC'
    }
  };

  /**
   * A hash of named query objects for specifying read query parameters per
   * data source.
   *
   * @property query
   * @type {Object}
   */
  this.query = this.query || {
    "query_name": {
      "all": {id: 123},
      "source1": {user_id: 123},
      "sourece2": {person_id: 123}
    }
  };

  /**
   * Only custom mappings are necessary, otherwise it just assumes the property
   * can be found on the primary table.
   *
   *
   * @property property
   * @type type
   * @deprecated
   */
  this.mapping = this.mapping || {"fields": {}, "sources": {}};

  // Keep references to all of the database and api models that make up this
  // translational layer model
  this.sources = this.sources || {};

  // Modify the definitions to make it more convenient to work with
  AbstractModel.modifyDefinitions(this.definition);
  this.setFieldOnSources(this.definition);

  AbstractSource.call(this);
};

/**
 * Takes the field definitions and transforms each view property from an array
 * to a hash for easy set functions.
 *
 * Could be private, but made static for unit-testing purposes.
 *
 * @method transformDefinitionViewArrayToHash
 * @param {Object} fieldDefinitions Field definitions
 * @returns {undefined}
 * @static
 */
AbstractModel.modifyDefinitions = function (fieldDefinitions) {
  var i;
  var j;
  var definition;
  var view;
  var views;
  var viewLookup;

  for (i in fieldDefinitions) {
    definition = fieldDefinitions[i];

    // Recursively call this function on any sub-documents
    if (AbstractModel.isSubDocumentDefinition(definition)) {
      AbstractModel.modifyDefinitions(definition);
      continue;
    }

    // Transform the views array to an object
    views = definition.views;
    viewLookup = {};

    for (j in views) {
      view = views[j];
      viewLookup[view] = true;
    }

    // Replace the views array with a lookup hash
    definition.views = viewLookup;

    // Set a type coercion function on the definition
    if (definition.type === 'INTEGER') {
      definition.coerceType = AbstractModel.integerTypeConverter;
    }
  }
};

AbstractModel.integerTypeConverter = function (val) {
  return parseInt(val, 10);
};

/**
 * Takes the field definitions and transforms each view property from an array
 * to a hash for easy set functions.
 *
 * Could be private, but made static for unit-testing purposes.
 *
 * @method transformDefinitionViewArrayToHash
 * @param {Object} fieldDefinitions Field definitions
 * @returns {undefined}
 * @static
 */
AbstractModel.addDataSerializers = function (fieldDefinitions) {
  var i;
  var j;
  var definition;
  var view;
  var views;
  var viewLookup;

  for (i in fieldDefinitions) {
    definition = fieldDefinitions[i];

    // Recursively call this function on any sub-documents
    if (AbstractModel.isSubDocumentDefinition(definition)) {
      AbstractModel.transformDefinitionViewArrayToHash(definition);
      continue;
    }

    views = definition.views;
    viewLookup = {};

    for (j in views) {
      view = views[j];
      viewLookup[view] = true;
    }

    // Replace the views array with a lookup hash
    definition.views = viewLookup;
  }
};

/**
 * A static utility method that identifies whether or not a definition is a
 * sub-document within the same model or a field definition.
 *
 * @method isSubDocumentDefinition
 * @param  {Object} def The definition to check
 * @returns {boolean}
 * @static
 */
AbstractModel.isSubDocumentDefinition = function (def) {
  var i;
  var ignoredKeys = {
    'constraints': true,
    'views': true,
    'mapping': true
  };

  if (def instanceof Array) {
    return false;
  }

  for (i in def) {
    if (typeof def[i] === 'object' && !ignoredKeys[i]) {
      return true;
    }
  }

  return false;
};

AbstractModel.getChildWithDotNotation = function (reference, object) {
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

AbstractModel.setChildWithDotNotation = function (reference, object, value) {
  var i, val, path = reference.split('.');

  val = object;
  for (i = 0; i < path.length - 1; i++) {
    // The reference was invalid
    if (!val[path[i]]) {
      val[path[i]] = {};
    }

    val = val[path[i]];
  }

  val[path[i]] = value;
};


AbstractModel.prototype = new AbstractSource();

AbstractModel.prototype.setFieldOnSources = function (definitions, prefix) {
  var mapping;
  var shouldSetField;

  // Make it easy to find out which field a source is mapped to
  for (var i in definitions) {
    if (AbstractModel.isSubDocumentDefinition(definitions[i])) {
      this.setFieldOnSources(definitions[i], i);
      continue;
    }

    mapping = definitions[i].mapping;

    shouldSetField = (
      mapping &&
      (
        mapping.type === this.FIELD_MAPPING_TYPES.SUBMODEL_ARRAY ||
        mapping.type === this.FIELD_MAPPING_TYPES.MODEL_REFERENCE
      )
    );

    if (shouldSetField) {
      this.sources[mapping.source].field = (prefix) ? prefix + '.' + i : i;
    }
  }
};


// CONSTANTS ===================================================================

/**
 * Field to source mapping types to be shared across the model and instance.
 * Comes from FieldMappingTypes.
 *
 * @property FIELD_MAPPING_TYPES
 * @type Object
 */
AbstractModel.prototype.FIELD_MAPPING_TYPES = FIELD_MAPPING_TYPES;

/**
 * Source-to-source methods of mapping. One-to-one, one-to-many, one way reference
 * etc.
 *
 * @property FIELD_MAPPING_TYPES
 * @type Object
 */
AbstractModel.prototype.SOURCE_MAPPING_TYPES = SOURCE_MAPPING_TYPES;

AbstractModel.prototype.TYPES = TYPES;


/**
 * Default validation error messages that are application-wide.
 *
 * @property property
 * @type type
 */
AbstractModel.prototype.ERROR_MSGS = {
  isNotNull: 'This field is required',
  extraField: 'This field is not a part of this model',
  isLength: 'There were too many or too few characters included',
  isIn: "This field is restricted to specified values"
};

/**
 * Constants for enacting special behaviors when settin up default query structures.
 *
 * @property QUERY_OPTIONS
 * @type {Objects}
 */
AbstractModel.prototype.QUERY_OPTIONS = {
  IGNORE: "__query_ignore_field__"
};


// UTILITY FUNCTIONS ===========================================================

/**
 * A recursive helper to recursively copy the definitions from the model we are
 * extending to this one
 *
 * @method method
 */
var extendRecursiveHelper = function (view, sourceName, source, target) {
  var alias;

  for (var i in source) {
    if (AbstractModel.isSubDocumentDefinition(source[i])) {
      target[i] = {};
      extendRecursiveHelper(view, sourceName, source[i], target[i]);
      continue;
    }

    // Perform a deep copy of the definition
    target[i] = {};
    for (var j in source[i]) {
      target[i][j] = source[i][j];
    }

    // Mark the field as read-only
    target[i].readOnly = true;

    // Remove constraints
    target[i].constraints = null;

    // Add the view
    target[i].views = view;

    // Add a mapping alias
    alias = (source[i].mapping && source[i].mapping.alias) ? source[i].mapping.alias : null;

    target[i].mapping = {
      "type": FIELD_MAPPING_TYPES.FIELD,
      "source": sourceName,
      "alias": alias
    };
  }
};

/**
 * Extends the given model by adding the definitions to the given property
 *
 * @method extend
 * @param {String} field Name of the field to extend
 * @param {Array} view An array of views to attach to each field
 * @param {String} source Name of the source where the data will come from
 * @param {AbstractModel} model The model instance we will use to extend
 */
AbstractModel.prototype.extend = function (field, view, sourceName, model) {
  if (!model) {
    return;
  }

  extendRecursiveHelper(view, sourceName, model.definition, this.definition[field]);
};

AbstractModel.prototype.slugify = function (str) {
  if (typeof str !== 'string') {
    return '';
  }

  str = this.replaceAll(' ', '-', str);
  str = this.replaceAll('\'', '', str);
  str = this.replaceAll('"', '', str);
  str = this.replaceAll('!', '', str);
  return str.toLowerCase();
};

/** replace all */
AbstractModel.prototype.replaceAll = function(find, replace, str) {
  find = find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  return str.replace(new RegExp(find, 'g'), replace);
};

/**
 * Merges default view options with the option passed into a specific request.
 *
 * @method mergeViewOptions
 * @param {Object} options Request-specified options
 */
AbstractModel.prototype.mergeViewOptions = function (options) {
  options = options || {};
  options.view = options.view || 'default';

  var viewDefaults = this.views[options.view];

  for (var i in viewDefaults) {
    options[i] = (typeof options[i] !== 'undefined') ? options[i] : viewDefaults[i];
  }

  return options;
};


// SETTERS/GETTERS =============================================================

/**
 * Add an instance of AbstractSource to the model.
 *
 * @method addSource
 * @param source {AbstractSource}
 * @since v0.0.13
 */
AbstractModel.prototype.addSource = function (source) {
  var sourceDefinition = this.sources[source.name];

  if (!sourceDefinition) {
    throw new Error(
      'The source: ' + source.name + ' was not defined on the this.sources property'
    );
  }

  if (!sourceDefinition.is_primary) {
    source.setForeignKey(sourceDefinition.foreign_key);
  } else {
    source.isPrimary = true;
    source.setForeignKey('id');
  }

  sourceDefinition.source = source;
};

/**
 * Getter for sources to reduce coupling
 *
 * @method getSource
 * @param {string} name Name of the source to get
 * @returns {Object} The source and its metadata
 */
AbstractModel.prototype.getSource = function (name) {
  return this.sources[name];
};

/**
 * Pass the appropriate fields to the Instance constructor.
 *
 */
AbstractModel.prototype.createInstance = function (data) {
  var instance = new this.Instance(
    this,
    this.validator
  );

  if (data) {
    instance.bind(data, true);
  }

  return instance;
};


// INITIALIZATION ==============================================================

/**
 * Set the connections into the ORM tables and initialize them.
 *
 */
AbstractModel.prototype.initialize = function () {
  var i;
  var sources = this.sources;
  var source;

  // Setup the node-validator object
  this.check = this.validator.check;

  for (i in sources) {
    source = sources[i].source;
    source.addConnections(this.connections);
    source.initialize();

    // Set the primary source
    if (sources[i].is_primary) {
      this.primarySource = sources[i];
    }
  }

  // Loop through the definitions and fill in the definitions for references
  this.addModelReferenceDefinitions(this.definition);
};

/**
 * When referencing a model, add its definitions to the current model.  This is
 * similar to model extension, and I think I may get rid of this feature in future
 * iterations.
 *
 * @method addModelReferenceDefinitions
 */
AbstractModel.prototype.addModelReferenceDefinitions = function (definitions) {
  var definition;
  var source;
  var referenceDefinitions;

  for (var i in definitions) {
    definition = definitions[i];

    if (AbstractModel.isSubDocumentDefinition(definition)) {
      this.addModelReferenceDefinitions(definition);
      continue;
    }

    // This only affects model references
    if (!definition.mapping || definition.mapping.type !== this.FIELD_MAPPING_TYPES.MODEL_REFERENCE) {
      continue;
    }

    source = this.sources[definition.mapping.source].source;
    referenceDefinitions = source.definition;

    definitions[i] = this.copyReferenceDefinitionToModelDefinition(definition, referenceDefinitions);
  }
};

AbstractModel.prototype.copyReferenceDefinitionToModelDefinition = function (originalDef, reference, level) {
  var refdef;
  var prefix = originalDef && (originalDef.mapping) ? originalDef.mapping.prefix + '_' : '';
  var alias;

  // Set the recursion level
  level = level || 0;

  var definition = {};

  // TODO: This seems like a hack, is there a better way to accomplish this?
  if (level === 0) {
    // Always create a primaryKey mapping type on the primary source
    var primaryKey = originalDef.mapping.primaryKey || 'id';
    definition[primaryKey] = {
      "type": "INTEGER",
      "constraints": originalDef.constraints,
      "views": originalDef.views,
      "mapping": {
        "type": this.FIELD_MAPPING_TYPES.FIELD,
        "source": this.primarySource.source.name,
        "alias": originalDef.mapping.alias
      }
    };
  }

  for (var i in reference) {
    // Skip the ID definition
    if (definition[i]) {
      continue;
    }

    refdef = reference[i];

    // Check if this definition is a subdocument and use recursion
    if (AbstractModel.isSubDocumentDefinition(refdef)) {
      definition[i] = this.copyReferenceDefinitionToModelDefinition(originalDef, refdef, level + 1);
      continue;
    }

    definition[i] = {};

    // Shallow copy all the properties from the definition into a new object
    for (var j in refdef) {
      definition[i][j] = refdef[j];
    }

    // Make the field read-only for referenced fields
    definition[i].readOnly = true;
    definition[i].views = originalDef.views;

    // Set the source in any mappings to the primary source
    if (definition[i].mapping) {
      definition[i].mapping.source = this.primarySource.source.name;
      alias = definition[i].mapping.alias;
      definition[i].mapping.alias = alias ? prefix + alias : prefix + i;
    } else {
      definition[i].mapping = {
        type: this.FIELD_MAPPING_TYPES.FIELD,
        source: this.primarySource.source.name,
        alias: prefix + i
      };
    }
  }

  return definition;
};


// CRUD METHODS ================================================================

/**
 * Get a list of all the instances of this model.
 *
 * Keep it simple for now and read only from the primary source.  I would like
 * to support the resolve references option, but only if the AbstractTable source
 * supports using a JOIN on the referenced model.
 *
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractModel.prototype.list = function (params, options, callback) {
  var i;
  var idMapping = this.definition[this.primaryKey].mapping;
  var idAlias = (idMapping && idMapping.alias) ? idMapping.alias : 'id';

  options = this.mergeViewOptions(options);

  options.limit = (options && options.limit) ? options.limit : 25;
  options.offset = (options && options.offset) ? options.offset : 0;
  options.sortField  = (options && options.sort_field) ? options.sort_field : idAlias;
  options.sortOrder = (options && options.sort_order) ? options.sort_order : 'ASC';
  options.randomSeed = (options && options.random_seed) ? options.random_seed : null;

  // Ensure proper sort order values
  if (options.sortOrder !== 'ASC' && options.sortOrder !== 'DESC') {
    options.sortOrder = 'ASC';
  }

  options.query = options.query || 'default';

  // Set the foreign key ID if this is a submodel
  if (this.isSource && !options.should_disable_foreign_key) {
    params[this.foreignKey] = params.parent_id;
    delete params.parent_id;
  }

  var sources = this.sources;
  var sourceInfo;
  var source;
  var query;

  for (i in sources) {
    sourceInfo = sources[i];
    source = sourceInfo.source;

    // Create a query object per source based on the params and the named query
    // specified
    query = this.getQueryForSource(options.query, params, source.name);

    if (sourceInfo.is_primary) {
      if (options.should_include_meta) {
        source.count(query, options, this.generateGetListDataCallback(query, options, source, callback));
      } else {
        source.list(query, options, this.generateListFromSourceCallback(source, 0, options, callback));
      }

      break;
    }
  }
};

/**
 * Generate a query object based on the custom parameters specified and the defaults
 * for this named query.
 *
 * @method method
 */
AbstractModel.prototype.getQueryForSource = function (queryName, customParams, sourceName) {
  var query = {};

  // Get query configuration (if one exists)
  var defaults = this.query[queryName];
  defaults = (defaults && defaults[sourceName]) ? defaults[sourceName] : {};

  // Copy the query parameters - ignoring parameters that are explicitly ignored
  // for this source
  // TODO: This might be better suited as having some dot-based query structure?
  for (var i in customParams) {
    if (defaults[i] !== this.QUERY_OPTIONS.IGNORE) {
      query[i] = customParams[i];
    }
  }

  // Add the default query params for this source
  for (var j in defaults) {
    if (defaults[j] !== this.QUERY_OPTIONS.IGNORE) {
      query[j] = defaults[j];
    }
  }

  return query;
};

/**
 * After counting the total, create a callback for actually retrieving the list
 * of data to be attached to the result.
 *
 * @method generateGetListDataCallback
 */
AbstractModel.prototype.generateGetListDataCallback = function (params, options, source, callback) {
  var self = this;

  return function (err, count) {
    if (err) {
      callback(err);
      return;
    }

    source.list(params, options, self.generateListFromSourceCallback(source, count, options, callback));
  };
};

/**
 * Generate a callback with the
 *
 * @method method
 * @param
 * @returns
 * @private
 */
AbstractModel.prototype.generateListFromSourceCallback = function (source, count, options, callback) {
  var self = this;
  return function (err, instances) {
    if (err) {
      callback(err);
      return;
    }

    var result = {
      meta: {
        total: count,
        limit: options.limit,
        offset: options.offset
      },
      list: null
    };

    var list = [];
    var sourceInstance;
    var newInstance;

    for (var i in instances) {
      sourceInstance = instances[i];
      newInstance = self.createInstance();
      newInstance.bindFromSourceInstance(source, sourceInstance);
      list.push(newInstance);
    }

    result.list = list;

    if (!options.should_include_meta) {
      result = list;
    }

    callback(null, result);
  };
};

/**
 *
 * @param data
 * @param callback
 */
AbstractModel.prototype.create = function (data, callback) {
  // Create the new instance to save
  var instance = this.createInstance();

  // Bind the raw data to it as an "update" to its original form
  instance.bind(data, true);
  instance.create(callback);
};

/**
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractModel.prototype.read = function (params, options, callback) {
  var i;
  var j;
  var query;

  var ONE_TO_ONE = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE;
  var ONE_TO_ONE_REF = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF;
  var ONE_TO_MANY = this.SOURCE_MAPPING_TYPES.ONE_TO_MANY;

  var sources = this.sources;
  var source;
  var sourceInfo;
  var idKey;

  // Create a new instance
  var newInstance = this.createInstance();

  options = this.mergeViewOptions(options);
  var view = options.view;
  var fields = options.fields;

  // Set the response callback based on whether or not we should resolve submodel
  // references
  if (options && options.should_resolve_references) {
    newInstance.setSourceOpCallback(this.generateResolveReferencesCallback(options, callback));
  } else {
    newInstance.setSourceOpCallback(callback);
  }

  for (i in sources) {
    sourceInfo = sources[i];
    source = sourceInfo.source;

    // Check if this source is included in the view
    if (!this.shouldReadFromSource(sourceInfo, view, fields)) {
      continue;
    }

    // Ignore one-to-one references because they must be handled after the primary
    //  record is read
    if (sourceInfo.relationship === ONE_TO_ONE_REF) {
      continue;
    }

    // Set the query params
    query = {};
    idKey = sourceInfo.foreign_key || 'id';

    if (params.id) {
      query[idKey] = params.id;
    }

    for (j in params) {
      if (j !== 'parent_id' && j !== 'id' && j !== idKey) {
        query[j] = params[j];
      }
    }

    newInstance.startSourceOp();

    // Set the foreign key from a calling parent model if this is a submodel
    if (this.isSource && params.parent_id) {
      query[this.foreignKey] = params.parent_id;
    }

    // Query the source appropriately depending on the relationship with this model
    if (sourceInfo.relationship === ONE_TO_ONE) {
      // Set the query defaults for this read
      query = this.getQueryForSource(options.query, query, source.name);
      source.read(
        query,
        options,
        this.generateSourceReadClosure(sourceInfo, newInstance, options)
      );

    } else if (sourceInfo.relationship === ONE_TO_MANY) {
      delete query[idKey];
      query.parent_id = params.id;
      var listOptions = {
        view: options.view,
        should_resolve_references: options.should_resolve_references,
        should_include_meta: options.should_include_meta,
        should_disable_foreign_key: options.should_disable_foreign_key,
        limit: options.limit,
        offset: options.offset
      };

      query = this.getQueryForSource(options.query, query, source.name);

      source.list(
        query,
        listOptions,
        this.generateSourceReadManyClosure(sourceInfo.field, newInstance)
      );

    }
  }
};

/**
 * Given the specified view or fields list, check if any of the fields for this
 * source have been requested for reading.
 *
 * @method shouldReadFromSource
 * @returns {boolean}
 */
AbstractModel.prototype.shouldReadFromSource = function (source, view, includedFields, definitions, prefix, includeAll) {
  var i;
  var mapping;
  var fieldViews;
  var areAnySubdocFieldsIncluded;
  var shouldIncludeAllSubFields;

  definitions = definitions || this.definition;
  prefix = prefix || '';

  // The primary source is always included
  if (view === 'all' || source.is_primary) {
    return true;
  }

  for (i in definitions) {
    // If this is a subdocument property, if any of the fields within that sub-doc
    // map to this source, we must include it
    if (AbstractModel.isSubDocumentDefinition(definitions[i])) {
      shouldIncludeAllSubFields = includedFields && includedFields[prefix + i];
      areAnySubdocFieldsIncluded = this.shouldReadFromSource(
        source,
        view,
        includedFields,
        definitions[i], i + '.',
        shouldIncludeAllSubFields
      );

      if (areAnySubdocFieldsIncluded) {
        return true;
      }

      continue;
    }

    mapping = definitions[i].mapping;
    fieldViews = definitions[i].views;

    if (!mapping) {
      continue;
    }

    if (mapping.source !== source.source.name) {
      continue;
    }

    // The field is either in the view or was explicitly included
    if (fieldViews[view] || (includedFields && includedFields[prefix + i]) || includeAll) {
      return true;
    }
  }

  // The field was not requested
  return false;
};

/**
 * Generates a handler that has the source object and the instance being populated
 * bound within its context.
 *
 * @method generateSourceReadClosure
 * @param {AbstractSource} source
 * @param {Instance} newInst
 * @returns {Function}
 */
AbstractModel.prototype.generateSourceReadClosure = function (sourceInfo, newInst) {
  var self = this;
  return function (err, instance) {
    // Another data source already had an error
    if (newInst.isSourceOpFailed()) {
      return;
    }

    // Call the callback with the error if the read failed
    if (err) {
      newInst.failSourceOp(err);
      return;
    }

    // This is the primary table but the record for this instance was not found
    if (sourceInfo.is_primary && !instance) {
      newInst.failSourceOp({code: 404, error: "Not found"});
      return;
    }

    // Bind the new data to the instance object
    newInst.bindFromSourceInstance(sourceInfo.source, instance);
    newInst.finishSourceOp();
  };
};

/**
 * Very similar to the one-to-one closure excepts takes the results and adds them
 * the array of submodels.
 *
 * @method generateSourceReadManyClosure
 * @param field
 * @param newInst
 * @returns {Function}
 */
AbstractModel.prototype.generateSourceReadManyClosure = function (field, newInst) {
  var self = this;
  // Create the array in the new instance if none exists
  if (!newInst[field]) {
    newInst[field] = [];
  }

  return function (err, instances) {
    // Another data source already had an error
    if (newInst.isSourceOpFailed()) {
      return;
    }

    // Call the callback with the error if the read failed
    if (err) {
      newInst.failSourceOp(err);
      return;
    }

    // Add the new sub-model instances to the appropriate field
    AbstractModel.setChildWithDotNotation(field, newInst, instances);
    newInst.finishSourceOp();
  };
};

/**
 * Given the specified view or fields list, check if any of the fields for this
 * source have been requested for reading.
 *
 * @method shouldReadFromSource
 * @returns {boolean}
 */
AbstractModel.prototype.isFieldIncludedInResult = function (field, view, reqFields) {
  if (view === 'all') {
    return true;
  }

  // Check if the field was specifically requested
  if (reqFields[field]) {
    return true;
  }

  // Check if the field is included in the requested view based on its
  // definition
  var definition = AbstractModel.getChildWithDotNotation(field, this.definition);
  var views = definition.views;

  for (var i in views) {
    if (views[i] === view) {
      return true;
    }
  }

  return false;
};

/**
 * After the tables have been queried to create the primary object and its one-to-many
 * references, resolve all foreign key references to other models as the actual
 * object.
 *
 * @returns {Function}
 */
AbstractModel.prototype.generateResolveReferencesCallback = function (options, callback) {
  var self = this;

  return function (err, newInstance) {
    if (err) {
      callback(err);
      return;
    }

    if (!newInstance) {
      callback();
      return;
    }

    // Set the response callback to be called once all reads have completed
    newInstance.setSourceOpCallback(callback);

    var sources = self.sources;
    var sourceInfo;
    var source;
    var view = options.view;
    var fields = options.fields;
    var query;
    var refKey;
    var idKey;
    var id;
    var i;
    var definition;
    var mapping;

    for (i in sources) {
      sourceInfo = sources[i];
      source = sourceInfo.source;

      // Check if this source is included in the view
      if (!self.shouldReadFromSource(sourceInfo, view, fields)) {
        continue;
      }

      // Check that this is a one-to-one reference
      if (sourceInfo.relationship !== self.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF) {
        continue;
      }

      query = {};
      refKey = sourceInfo.field;

      definition = AbstractModel.getChildWithDotNotation(refKey, self.definition);
      mapping = definition ? definition.mapping : null;
      idKey = (mapping && mapping.refAlias) ? mapping.refAlias : 'id';
      id = AbstractModel.getChildWithDotNotation(refKey, newInstance);

      // The reference ID does not exist
      if (!id) {
        continue;
      }

      newInstance.startSourceOp();

      query[idKey] = id;

      source.read(
        query,
        options,
        self.generateSubmodelReferenceClosure(refKey, newInstance)
      );
    }

    // Make sure at least one operation completes
    setImmediate(function () {
      newInstance.startSourceOp();
      newInstance.finishSourceOp();
    });
  };
};

/**
 *
 *
 * @method generateSubmodelReferenceClosure
 * @returns {function}
 */
AbstractModel.prototype.generateSubmodelReferenceClosure = function (field, newInst) {
  return function (err, refInstance) {
    // Another data source already had an error
    if (newInst.isSourceOpFailed()) {
      return;
    }

    // Call the callback with the error if the read failed
    if (err) {
      newInst.failSourceOp(err);
      return;
    }

    // Transform the model instance into a regular object and attach to the
    // new instance
    var data = refInstance ? refInstance.toObject() : null;
    AbstractModel.setChildWithDotNotation(field, newInst, data);
    newInst.finishSourceOp();
  };
};

/**
 * Updating complex documents is a very tricky procedure.  All updates across
 * data sources must succeed or be rolled back.
 *
 * For now protect against failed transactions by only allowing updates to one
 * data source per request.
 *
 * @TODO: We need to experiment with a transaction rollback strategy that works
 *
 * @param params
 * @param data
 * @param callback
 */
AbstractModel.prototype.update = function (params, data, callback) {

  this.read(params, {view: 'all'}, function (err, instance) {
    if (err || !instance) {
      callback(err);
      return;
    }

    instance.bind(data, true);
    instance.update(callback);
  });
};

/**
 *
 * @param params
 * @param callback
 */
AbstractModel.prototype['delete'] = function (params, callback) {
  this.read(params, {view: 'all'}, function (err, instance) {
    if (err || !instance) {
      callback(err);
      return;
    }

    instance.destroy(callback);
  });
};

module.exports = AbstractModel;
