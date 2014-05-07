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
  this.definition = this.definition || {};

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

/**
 * A constant object of field types
 *
 * @property TYPES
 * @type {object}
 * @const
 */
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

  // Replace HTML escaped chars with nothing
  str = this.replaceAll('&[^;]+;', '', str);

  // Replace spaces with dashes
  str = this.replaceAll(' ', '-', str);

  // Replace bad characters
  str = this.replaceAll('\'', '', str);
  str = this.replaceAll('"', '', str);
  str = this.replaceAll('!', '', str);

  // URL encode the final string to make sure it is URL safe
  return encodeURIComponent(str.toLowerCase());
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
};


// CRUD METHODS ================================================================

/**
 *
 * @param reference
 * @param object
 */
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

/**
 * Deeply set a child using dots to indicate levels.  If the level does not exist,
 * create it.
 *
 * @method method
 */
AbstractModel.setChildWithDotNotation = function (reference, value, object) {
  var i, val, path = reference.split('.');

  val = object;
  for (i = 0; i < path.length - 1; i++) {
    if (typeof val[path[i]] !== 'object') {
      val[path[i]] = {};
    }

    val = val[path[i]];
  }

  // We've gone to the second to last level, and guaranteed its an object, so we
  // can set the value
  val[path[i]] = value;
  return object;
};

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
  var ONE_TO_ONE = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE;
  var ONE_TO_ONE_REF = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF;
  var ONE_TO_MANY = this.SOURCE_MAPPING_TYPES.ONE_TO_MANY;

  var idMapping = this.definition[this.primaryKey].mapping;
  var idAlias = (idMapping && idMapping.alias) ? idMapping.alias : 'id';

  // Set the view options
  options = options || {};
  options = this.mergeViewOptions(options);

  if (options.limit === null) {
    options.offset = null;
  } else {
    options.limit = options.limit || 25;
    options.offset = options.offset || 0;
  }

  options.limit = (options && (options.limit || options.limit === null)) ? options.limit : 25;
  options.offset = (options && options.offset) ? options.offset : 0;
  options.sortField  = (options && options.sort_field) ? options.sort_field : idAlias;
  options.sortOrder = (options && options.sort_order) ? options.sort_order : 'ASC';
  options.randomSeed = (options && options.random_seed) ? options.random_seed : null;

  // Ensure proper sort order values
  if (options.sortOrder !== 'ASC' && options.sortOrder !== 'DESC') {
    options.sortOrder = 'ASC';
  }

  options.query = options.query || 'default';

  // Set a clone of the original parameters on the options object to be passed
  // through for the submodels to interact with
  options.original_params = AbstractModel.clone(params);

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
    query = this.getQueryForSource(options.query, params, sourceInfo);

    if (sourceInfo.is_primary) {
      if (options.should_include_meta) {
        source.count(query, options, this.generateGetListDataCallback(query, options, source, callback));
      } else {
        source.list(query, options, this.generateListFromSourceCallback(source, {}, options, callback));
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
AbstractModel.prototype.getQueryForSource = function (queryName, customParams, sourceInfo) {
  var i;
  var query = {};
  var sourceName = sourceInfo.source ? sourceInfo.source.name : null;
  var isPrimary = sourceInfo.is_primary;
  var type = sourceInfo.relationship;
  var field = sourceInfo.field;

  // Get query configuration (if one exists)
  var defaults = this.query[queryName];
  defaults = (defaults && defaults[sourceName]) ? defaults[sourceName] : {};

  // Shallow copy the query parameters - ignoring parameters that are explicitly ignored
  // for this source
  for (i in customParams) {
    if (defaults[i] !== this.QUERY_OPTIONS.IGNORE) {
      query[i] = customParams[i];
    }
  }

  // Add the default query params for this source (using dot notation for default
  // keys)
  for (i in defaults) {
    if (defaults[i] !== this.QUERY_OPTIONS.IGNORE) {
      query[i] = defaults[i];
    }
  }


  var finalQuery = {};

  if (type === this.SOURCE_MAPPING_TYPES.ONE_TO_ONE || type === this.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF) {
    // Loop through the query and transform the items into their aliases depending
    // on their definition
    var key;
    for (i in query) {
      key = this.transformQueryParamKeyToAlias(i, sourceName, isPrimary);

      if (key) {
        finalQuery[key] = query[i];
      }
    }
  } else {
    // If this is not a one-to-one relationship, strip out any parameters that do
    // not start with the field referencing this property and then return the fields
    // that do
    var fieldRegex = new RegExp('^' + field + '\.');

    // Search for the field name + '.' like 'image.user_id' and then remove
    // the prefix ('image.') and set the field as a parameter in the query
    for (i in query) {
      if (fieldRegex.test(i)) {
        finalQuery[i.replace(fieldRegex, '')] = query[i];
      }
    }
  }

  return finalQuery;
};

/**
 * Using dot notation, transform all of the query params into their aliases.  I
 * can't imagine a situation in which we wouldn't use dot notation to specify
 * nested fields (mongo, etc) so I think its safe to assume our parameters can
 * be flat.
 *
 * @method method
 */
AbstractModel.prototype.transformQueryParamKeyToAlias = function (key, sourceName, isPrimary) {
  var mapping = AbstractModel.getChildWithDotNotation(key + '.mapping', this.definition);

  // If there is no mapping, then this parameter cannot apply to this source unless
  // it is primary
  if (!mapping || !mapping.source) {
    // Make sure that this is not a param meant for a submodel
    return (isPrimary && key.indexOf('.') === -1) ? key : false;
  }

  // If there is a mapping, then the source must match, or it doesn't apply
  if (mapping.source !== sourceName) {
    return false;
  }

  // If the source exists, use the alias if one exists
  return (mapping.alias) ? mapping.alias : key;
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

    // Set the count in the metadata object
    var meta = {};
    meta.total = count;

    source.list(params, options, self.generateListFromSourceCallback(source, meta, options, callback));
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
AbstractModel.prototype.generateListFromSourceCallback = function (source, meta, options, callback) {
  var self = this;
  meta = meta || {};

  return function (err, instances) {
    var i;

    if (err) {
      callback(err);
      return;
    }

    var result = {list: null, meta: {}};

    for (i in meta) {
      result.meta[i] = meta[i];
    }

    // Also add the options to the metadata
    for (i in options) {
      result.meta[i] = options[i];
    }

    var list = [];
    var sourceInstance;
    var newInstance;

    for (i in instances) {
      sourceInstance = instances[i];
      newInstance = self.createInstance();
      newInstance.bindFromSourceInstance(source, sourceInstance);
      list.push(newInstance);
    }

    result.list = list;

    if (!options.should_include_meta) {
      result = list;
    }

    // Decorate the list with items from the various disparate data sources
    self.decorateList(list, options, function (err, decoratedInstances) {
      // Return the result with meta if it is necessary
      callback(err, result);
    });
  };
};



/**
 * Manage the asynchronous nature of decorating data by creating a closure and
 * managing the state of the callback chain based on the status object which should
 * look like:
 *
 * ```
 * {cnt: 1, isFailed: false}
 * ```
 *
 * @method method
 */
AbstractModel.prototype.generateDecoratorCallback = function (status, instances, sourceInfo, callback) {
  status.cnt++;
  var ONE_TO_ONE = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE;
  var ONE_TO_ONE_REF = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF;
  var ONE_TO_MANY = this.SOURCE_MAPPING_TYPES.ONE_TO_MANY;

  var source = sourceInfo.source;
  var localKey = sourceInfo.local_key || 'id';
  var foreignKey = sourceInfo.foreign_key;
  var field = sourceInfo.field;
  var type = sourceInfo.relationship

  return function (err, data) {
    if (err) {
      if (!status.isFailed) {
        status.isFailed = true;
        callback(err);
      }

      return;
    }

    // Add the data to its source instance
    var values;
    var obj;
    for (var i in instances) {
      for (var j in data) {
        if (instances[i].get(localKey) === data[j].get(foreignKey)) {
          if (type === ONE_TO_MANY) {
            values = instances[i].get(field);

            if (!(values instanceof Array)) {
              values = [];
              AbstractModel.setChildWithDotNotation(field, values, instances[i]);
            }

            values.push(data[j]);
          } else if (type === ONE_TO_ONE_REF) {
            // TODO: Use a setter for references - also need to account for
            //       one-to-one non-reference types using bind vs straight setters
            obj = (typeof data[j].toObject === 'function') ? data[j].toObject('all') : data[j];
            AbstractModel.setChildWithDotNotation(field, obj, instances[i]);

          } else if (type === ONE_TO_ONE) {
            instances[i].bindFromSourceInstance(source, data[j]);
          }
        }
      }
    }

    status.cnt--;
    if (status.cnt === 0) {
      callback(null, instances);
    }
  }
};

/**
 * I don't want to import lodash as a dependency for one method, so I'll re-implement
 * here.  If it becomes an issue then I'll import lo-dash.
 *
 * @method pluck
 */
AbstractModel.pluck = function (field, array) {
  var values = [];
  for (var i in array) {
    if (array[i].get(field)) {
      values.push(array[i].get(field));
    }
  }

  return values;
};

/**
 * Another lodash-like utility function for recursively cloning an object
 *
 * @method clone
 */
AbstractModel.clone = function (obj) {
  var copy = {};
  for (var i in obj) {
    if (typeof obj[i] === 'object' && obj[i] !== null) {
      copy[i] = AbstractModel.clone(obj[i]);
    } else {
      copy[i] = obj[i];
    }
  }

  return copy;
};

/**
 * After the list
 *
 * @method method
 */
AbstractModel.prototype.decorateList = function (instances, options, callback) {
  // Exit early if there are no instances
  if (instances.length === 0) {
    callback(null, instances);
    return;
  }

  var ONE_TO_ONE = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE;
  var ONE_TO_ONE_REF = this.SOURCE_MAPPING_TYPES.ONE_TO_ONE_REF;
  var ONE_TO_MANY = this.SOURCE_MAPPING_TYPES.ONE_TO_MANY;

  var view = options.view;
  var fields = options.fields;

  var sources = this.sources;
  var sourceInfo;
  var source;
  var query;

  var foreignKey;
  var localKey;
  var type;
  var field;
  var opts;

  // Use an object as a counter so it's reference can be passed around to sub-funcs
  // TODO: Consider using Async or similar JS lib to handle this
  var status = {cnt: 0, isFailed: false};

  for (i in sources) {
    sourceInfo = sources[i];
    source = sourceInfo.source;
    localKey = sourceInfo.local_key || 'id';
    foreignKey = sourceInfo.foreign_key;
    field = sourceInfo.field;

    // Clone the options so they can be modified with impunity
    opts = AbstractModel.clone(options);

    // Indicate that we want to list objects for decoration - this means that given
    // a list of keys, we should use the limit to get the `limit_per_key` number of
    // items per key for one-to-many relationships
    opts.is_limited_by_key = true;

    // Delete typical list options because they are unnecessary for sub-lists or
    // disable them
    opts.sort_field = null;
    opts.should_include_meta = false;
    delete opts.offset;
    delete opts.random_seed;

    // Create a query object per source based on the params and the named query
    // specified - make sure to make a clone of the original request parameters
    query = AbstractModel.clone(options.original_params);
    query = this.getQueryForSource(opts.query, query, sourceInfo);

    // Get the list of local keys to include
    query.parent_id = AbstractModel.pluck(localKey, instances);

    // Skip if there are no join keys
    if (query.parent_id.length === 0) {
      continue;
    }

    // Skip the primary source, we already got data from it
    if (sourceInfo.is_primary) {
      continue;
    }

    // Check if the source is included in the view
    if (!this.shouldReadFromSource(sourceInfo, view, fields)) {
      continue;
    }

    if (sourceInfo.relationship === ONE_TO_ONE || sourceInfo.relationship === ONE_TO_ONE_REF) {
      opts.limit = null;
      opts.sortField = foreignKey;
    } else if (sourceInfo.relationship === ONE_TO_MANY) {
      opts.limit = opts.submodel_limit || 3;
      isOneToMany = true;
    } else {
      // Skip any other types of models
      continue;
    }

    // Make the request for data and setup a callback to decorate the instance
    // list properly
    source.list(
      query,
      opts,
      this.generateDecoratorCallback(status, instances, sourceInfo, callback)
    );
  }

  // If there is no decoration necessary, call the callback
  if (status.cnt === 0) {
    callback(null, instances);
  }
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
 * Just wraps the list method b/c the logic is the same.
 *
 * @method read
 */
AbstractModel.prototype.read = function (params, options, callback) {
  var opts = AbstractModel.clone(options);
  opts.limit = 1;
  opts.offset = 0;
  opts.should_include_meta = false;

  this.list(params, opts, function (err, list) {
    callback(err, list[0]);
  });
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

/**
 * Search using any SEARCH type sources for a list of IDs and then return a list
 * of the corresponding objects based off of this model's native data stores.
 *
 * @method search
 */
AbstractModel.prototype.search = function (params, options, callback) {
  var self = this;

  var i;
  var source;
  var searchSource;
  for (i in this.sources) {
    source = this.sources[i];

    if (source.relationship === this.SOURCE_MAPPING_TYPES.SEARCH) {
      searchSource = source;
      break;
    }
  }

  if (!searchSource) {
    throw new Error('You cannot call the search() method on a model that has no search data sources.');
  }

  searchSource.source.list(params, options, function (err, results) {
    if (err) {
      callback(err);
      return;
    }

    var meta = results.meta;
    var list = results.list;

    var ids = [];
    for (var i in list) {
      ids.push(list[i].id);
    }

    // Get the instances for the IDs returned by the search results
    var params = {};
    var searchField = options.search_field || 'id';
    params[searchField] = ids;

    // Need to disable meta for the list b/c we already know the count
    var opts = AbstractModel.clone(options);
    opts.should_include_meta = false;

    // Reset limit and offset b/c its unnecessary for retrieving search results
    opts.limit = null;
    opts.offset = 0;

    self.list(params, opts, function (err, results) {
      if (err) {
        callback(err);
      } else {
        callback(null, {meta: meta, list: results});
      }
    });
  });
};

module.exports = AbstractModel;
