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

  this.isNextGenModel = this.isNextGenModel || false;

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

  var definitions = this.definition;
  var mapping;
  var shouldSetField;

  if (this.isNextGenModel) {
    AbstractModel.transformDefinitionViewArrayToHash(this.definition);

    // Make it easy to find out which field a source is mapped to
    for (var i in definitions) {
      mapping = definitions[i].mapping;

      shouldSetField = (
        mapping &&
        (
          mapping.type === this.FIELD_MAPPING_TYPES.SUBMODEL_ARRAY ||
          mapping.type === this.FIELD_MAPPING_TYPES.MODEL_REFERENCE
        )
      );

      if (shouldSetField) {
        this.sources[mapping.source].field = i;
      }
    }
  }

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
AbstractModel.transformDefinitionViewArrayToHash = function (fieldDefinitions) {
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


AbstractModel.prototype = new AbstractSource();

/**
 * Field to source mapping types to be shared across the model and instance.
 * Comes from FieldMappingTypes.
 *
 * @property FIELD_MAPPING_TYPES
 * @type Object
 */
AbstractModel.prototype.FIELD_MAPPING_TYPES = FIELD_MAPPING_TYPES;


/**
 * For backwards compatability
 *
 * @property MAPPING_TYPES
 * @type Object
 * @deprecated
 */
AbstractModel.prototype.MAPPING_TYPES = FIELD_MAPPING_TYPES;


/**
 * Source-to-source methods of mapping. One-to-one, one-to-many, one way reference
 * etc.
 *
 * @property FIELD_MAPPING_TYPES
 * @type Object
 */
AbstractModel.prototype.SOURCE_MAPPING_TYPES = SOURCE_MAPPING_TYPES;


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
 * Add a relational table to a specific database
 *
 * @param source An instance of AbstractTable to add to the database
 */
AbstractModel.prototype.addDatabaseTable = function (source) {
  // Set the is_primary flag on the table
  if (this.mapping.sources.databases[source.database].tables[source.name].is_primary) {
    source.setIsPrimary(true);
  }

  this.sources.databases[source.database].tables[source.name] = source;
};

/**
 * Set the submodel into the sources object
 *
 * @param source
 */
AbstractModel.prototype.addSubmodel = function (source) {
  source.isSubmodel = true;
  source.foreignKey = this.mapping.sources.models[source.name].foreign_key;
  this.sources.models[source.name].model = source;
};

/**
 * Set the reference model into the sources object
 *
 * @param source
 */
AbstractModel.prototype.addReferenceModel = function (source) {
  this.sources.models[source.name].model = source;
};


/**
 * Set the api client
 *
 * @param source
 */
AbstractModel.prototype.addApiClient = function (source) {
  this.sources.apis[source.name] = source;
};

/**
 * Add a file data source.
 *
 * @param filesource
 */
AbstractModel.prototype.addFile = function (filesource) {
  this.sources.files[filesource.name] = filesource;
};

/**
 * Provide access to submodels for creating sub-resource routes.
 *
 * @param modelName
 */
AbstractModel.prototype.getSubmodel = function (modelName) {
  return this.sources.models[modelName].model;
};

/**
 * Allow pre-initialized connections to be injected into this model to be further
 * passed to the relevant tables.
 *
 * @param dbName The database this connection is connected to
 * @param connection An initialized database connection
 */
AbstractModel.prototype.setConnection = function (dbName, connection) {
  if (this.isNextGenModel) {
    this.addConnection(connection);
    return;
  }

  if (this.sources.databases && this.sources.databases[dbName]) {
    this.sources.databases[dbName].connection = connection;
  }
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

  if (!this.isNextGenModel) {
    this.initialize_deprecated();
    return;
  }

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

/**
 * Set the connections into the ORM tables and initialize them.
 *
 * @deprecated
 */
AbstractModel.prototype.initialize_deprecated = function () {
  var i, j;

  // Setup the node-validator object
  this.check = this.validator.check;

  // Initialize all of the tables within each database
  var dbs = this.sources.databases;
  var tables;

  for (i in dbs) {
    tables = dbs[i].tables;

    for (j in tables) {
      tables[j].initialize(dbs[i].connection);
    }
  }

  // Initialize the sub models by passing them the open connections and calling
  // initialize on them
  var models = this.sources.models;
  for (i in dbs) {
    for (j in models) {
      models[j].model.setConnection(i, dbs[i].connection);
    }
  }

  for (i in models) {
    models[i].model.initialize();
  }

  // Initialize files
  var files = this.sources.files;
  for (i in files) {
    files[i].initialize();
  }

  // Initialize APIs
  var apis = this.sources.apis;
  for (i in apis) {
    apis[i].initialize();
  }
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

  if (!this.isNextGenModel) {
    this.list_deprecated(params, options, callback);
    return;
  }

  var i;
  var idMapping = this.definition.id.mapping;
  var idAlias = (idMapping && idMapping.alias) ? idMapping.alias : 'id';

  options.limit = (options && options.limit) ? options.limit : 25;
  options.offset = (options && options.offset) ? options.offset : 0;
  options.sortField  = (options && options.sort_field) ? options.sort_field : idAlias;
  options.sortOrder = (options && options.sort_order) ? options.sort_order : 'ASC';

  // Ensure proper sort order values
  if (options.sortOrder !== 'ASC' && options.sortOrder !== 'DESC') {
    options.sortOrder = 'ASC';
  }

  // Set the foreign key ID if this is a submodel
  if (this.isSource) {
    params[this.foreignKey] = params.parent_id;
    delete params.parent_id;
  }

  var sources = this.sources;
  var sourceInfo;
  var source;

  for (i in sources) {
    sourceInfo = sources[i];
    source = sourceInfo.source;

    if (sourceInfo.is_primary) {
      source.list(params, options, this.generateListFromSourceCallback(source, callback));
      break;
    }
  }
};

/**
 * Generate a callback with the
 *
 * @method method
 * @param
 * @returns
 * @private
 */
AbstractModel.prototype.generateListFromSourceCallback = function (source, callback) {
  var self = this;
  return function (err, instances) {
    if (err) {
      callback(err);
      return;
    }

    var list = [];
    var sourceInstance;
    var newInstance;

    for (var i in instances) {
      sourceInstance = instances[i];
      newInstance = self.createInstance();
      newInstance.bindFromSourceInstance(source, sourceInstance);
      list.push(newInstance);
    }

    callback(null, list);
  };
};


/**
 * Get a list of all the instances of this model.
 *
 * Keep it simple for now and do not account for other databases or APIs for
 * data.  We can fill that in later.  Also do not allow joins in lists,
 * require that they explicitly look for sub-documents with sub-routes.
 *
 *
 * @param params
 * @param options
 * @param callback
 * @deprecated
 */
AbstractModel.prototype.list_deprecated = function (params, options, callback) {
  // Use ORM functions to pull a listing fo this type of model
  // @TODO: This is the most difficult to accomplish with joins
  // @TODO: Create an option for populating sub-fields
  // @TODO: One-to-one mappings are easy, but one-to-many requires more thought
  // @TODO:   do we include all child documents or just a few?
  var i, j, query;
  var idAlias = (this.mapping.fields.id) ? this.mapping.fields.id.alias : 'id';

  var limit = (options && options.limit) ? options.limit : 25;
  var offset = (options && options.offset) ? options.offset : 0;
  var sortField  = (options && options.sort_field) ? options.sort_field : idAlias;
  var sortOrder = (options && options.sort_order) ? options.sort_order : 'ASC';

  // Ensure proper sort order values
  if (sortOrder !== 'ASC' && sortOrder !== 'DESC') {
    sortOrder = 'ASC';
  }

  // The list of objects to return
  var list = [];

  // The __count property lets the callbacks know how many tables we are
  // joining against to get the final result
  list.__count = 0;

  // Save a reference to the original callback to be able to respond once all
  // tables have been read from
  list.__callback = callback;

  // Add all of the data to the instance that is sourced from DB tables
  var dbMappings = this.mapping.sources.databases;
  var table, tableMappings;
  for (i in dbMappings) {
    tableMappings = dbMappings[i].tables;

    // Loop through all of the tables and build the instance
    for (j in tableMappings) {
      table = this.sources.databases[i].tables[j];

      // Do not fill out sub-doc/joined properties for the list endpoint
      if (!table.isPrimary) {
        continue;
      }

      query = {
        where: {},
        limit: limit,
        offset: offset,
        order: sortField + ' ' + sortOrder
      };

      // Currently sub-models only allow one level of nesting
      if (this.isSubmodel) {
        query.where[this.foreignKey] = params.parent_id;
      }

      list.__count++;
      table.readMany(query, options, this.generateListClosure(list, table));
    }
  }
};

/**
 * Create a closure with the specific table that we are querying to create a
 * list.
 *
 * @param list
 * @param table
 * @returns {Function}
 */
AbstractModel.prototype.generateListClosure = function (list, table) {
  var self = this;

  return function (err, instances) {
    var inst;
    var cb;

    // Another table already had an error
    if (list.__isFailed) {
      return;
    }

    // Call the callback with the error if the read failed
    if (err) {
      list.__isFailed = true;
      cb = list.__callback;
      cb(err, null);
      return;
    }

    // Loop through each instance of the sub-model and transform it through
    // the mapping function
    for (var i in instances) {
      inst = self.createInstance();
      inst.bindOrmInstance(
        table,
        instances[i]
      );
      list.push(inst);
    }

    // Call the callback
    list.__count--;
    if (list.__count === 0) {
      cb = list.__callback;
      delete list.__callback;
      delete list.__count;
      cb(null, list);
    }
  };
};

/**
 * Save records to the DB based on a list of objects.
 *
 * @param data
 * @param callback
 */
AbstractModel.prototype.bulkCreate = function (data, callback) {
  if (!(data instanceof Array)) {
    callback({code: 400, error: "Data not an array"});
  }

  var self = this;
  var i, instance;
  var cnt = 0;
  var result = [];

  // Generates a callback function that will wait for all save operations to
  // complete before calling the function callback
  function generateCallback(i) {
    cnt++;

    return function (err, instance) {
      // Decrement the number of pending operations
      cnt--;

      if (err) {
        var errMsg = JSON.stringify(err);
        result[i] = {code: 500, err: errMsg};
        console.error('Error in bulk create for model ' + self.name + ': ' + errMsg);
      } else {
        result[i] = instance.toObject();
      }

      if (cnt === 0) {
        callback(null, result);
      }
    };
  }

  // Loop through all of the data objects and create them if they pass validation
  for (i in data) {
    // Create the new instance to save
    instance = this.createInstance();

    // Bind the raw data to it as an "update" to its original form
    instance.bind(data, true);

    // Validate the instance
    if (instance.isValid()) {
      instance.create(generateCallback(i));
    } else {
      result[i] = instance.getErrors();
    }
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
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractModel.prototype.read = function (params, options, callback) {
  if (!this.isNextGenModel) {
    this.read_deprecated(params, options, callback);
    return;
  }

  var i;
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

  var view = options.view || 'default';
  var fields = options.fields || [];

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


    query = {};
    newInstance.startSourceOp();

    // Set the foreign key from a calling parent model if this is a submodel
    if (this.isSource && params.parent_id) {
      query[this.foreignKey] = params.parent_id;
    }

    idKey = sourceInfo.foreign_key || 'id';
    query[idKey] = params.id;

    // Query the source appropriately depending on the relationship with this model
    if (sourceInfo.relationship === ONE_TO_ONE) {
      source.read(
        query,
        options,
        this.generateSourceReadClosure(sourceInfo, newInstance, options)
      );

    } else if (sourceInfo.relationship === ONE_TO_MANY) {
      query = {parent_id: params.id};
      source.list(
        query,
        options,
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
      shouldIncludeAllSubFields = includedFields[prefix + i];
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
    if (fieldViews[view] || includedFields[prefix + i] || includeAll) {
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
 * @method generateOneToManyReadClosure
 * @param field
 * @param newInst
 * @returns {Function}
 */
AbstractModel.prototype.generateSourceReadManyClosure = function (field, newInst) {
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
    newInst[field] = newInst[field].concat(instances);
    newInst.finishSourceOp();
  };
};


/**
 *
 *
 * @method read_deprecated
 * @deprecated Old way of reading
 */
AbstractModel.prototype.read_deprecated = function (params, options, callback) {
  var i, j, query;

  // Create a new instance
  var newInstance = this.createInstance();

  // Set the response callback based on whether or not we should resolve submodel
  // references
  if (options && options.should_resolve_references) {
    newInstance.setSourceOpCallback(this.generateResolveReferencesCallback_deprecated(options, callback));
  } else {
    newInstance.setSourceOpCallback(callback);
  }


  // Add all of the data to the instance that is sourced from DB tables
  var dbMappings = this.mapping.sources.databases;
  var table, tableMappings, idAlias;

  // Check if there are specific fields or views we are looking to include to
  // limit the database queries we perform
  var view = options.view || 'default';
  var fields = options.fields || [];


  for (i in dbMappings) {
    tableMappings = dbMappings[i].tables;

    // Loop through all of the tables and build the instance, marrying all of
    // the data from the disparate sources
    for (j in tableMappings) {
      table = this.sources.databases[i].tables[j];

      // Check if this table should be included in the view
      if (!table.isPrimary && !this.shouldReadFromDbSource(table, view, fields)) {
        continue;
      }

      newInstance.startSourceOp();

      // Currently sub-models only allow one level of nesting
      if (this.isSubmodel) {
        query.where[this.foreignKey] = params.parent_id;
      }

      // Set the query structure for the ORM appropriately
      if (table.isPrimary) {
        idAlias = (this.mapping.fields.id) ? this.mapping.fields.id.alias : 'id';
        query = {where: {}};
        query.where[idAlias] = params.id;

        table.readOne(
          query,
          options,
          this.generatePrimaryTableReadClosure(table, newInstance, options)
        );

      } else {
        query = {where: {}};
        query.where[tableMappings[j].foreign_key] = params.id;

        table.readOne(
          query,
          options,
          this.generateSecondaryTableReadClosure(table, newInstance, table.isPrimary)
        );
      }
    }
  }

  // Read from sub-models to populate one-to-many fields
  var modelMappings = this.mapping.sources.models;
  var model, targetField;
  var mappingFields;
  var mapping;
  var SUBMODEL_ARRAY = this.FIELD_MAPPING_TYPES.SUBMODEL_ARRAY;

  for (i in modelMappings) {
    model = this.sources.models[i].model;
    targetField = null;

    mappingFields = this.mapping.fields;
    for (j in mappingFields) {
      mapping = mappingFields[j];

      if (mapping.model !== model.name) {
        continue;
      }

      if (mapping.type === SUBMODEL_ARRAY) {
        targetField = j;
      }
    }

    // There is no field in the current sub-set using this model
    if (!targetField) {
      continue;
    }

    // The field was not included in the resulting view and therefore we do not
    // need to query this model
    if (!this.isFieldIncludedInResult(targetField, view, fields)) {
      continue;
    }

    newInstance.startSourceOp();
    model.list({parent_id: params.id}, options, this.generateOneToManyReadClosure(targetField, newInstance));
  }
};

/**
 * Given the specified view or fields list, check if any of the fields for this
 * source have been requested for reading.
 *
 * @method shouldReadFromSource
 * @returns {boolean}
 * @deprecated
 */
AbstractModel.prototype.shouldReadFromDbSource = function (source, view, fields) {
  if (view === 'all') {
    return true;
  }

  // Create a lookup map to check if fields are required
  var i;
  var mapping;
  var DB_FIELD = this.FIELD_MAPPING_TYPES.DB_FIELD;
  var fieldMappings = this.mapping.fields;

  for (i in fieldMappings) {
    mapping = fieldMappings[i];

    if (mapping.type !== DB_FIELD) {
      continue;
    }

    if (mapping.database !== source.database || mapping.table !== source.name) {
      continue;
    }

    if (this.isFieldIncludedInResult(i, view, fields)) {
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
  var definition = this.getChildWithDotNotation(field, this.definition);
  var views = definition.views;

  for (var i in views) {
    if (views[i] === view) {
      return true;
    }
  }

  return false;
};

/**
 * Given a reference in string . notation and an object, recursively search for
 * the value reference by the dot-delimited key.
 *
 * @method getChildWithDotNotation
 * @returns {*}
 */
AbstractModel.prototype.getChildWithDotNotation = function (reference, object) {
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
 *
 *
 * @param table
 * @param newInst
 * @returns {Function}
 */
AbstractModel.prototype.generatePrimaryTableReadClosure = function (table, newInst) {
  return function (err, ormInstance) {
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
    if (!ormInstance) {
      newInst.failSourceOp({code: 404, error: "Not found"});
      return;
    }

    // Bind the new data to the instance object
    newInst.bindOrmInstance(table, ormInstance);
    newInst.finishSourceOp();
  };
};

/**
 * Create a closure and return a callback with a common structure for all read
 * operations from a database table.
 *
 * @param table
 * @param newInst
 * @returns {Function}
 */
AbstractModel.prototype.generateSecondaryTableReadClosure = function (table, newInst) {
  return function (err, ormInstance) {
    // Another data source already had an error
    if (newInst.isSourceOpFailed()) {
      return;
    }

    // Call the callback with the error if the read failed
    if (err) {
      newInst.failSourceOp(err);
      return;
    }

    // Bind the new data to the instance object
    if (ormInstance) {
      newInst.bindOrmInstance(table, ormInstance);
    }

    newInst.finishSourceOp();
  };
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
      idKey = self.definition[refKey].mapping.alias || 'id';
      id = newInstance[refKey];

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
 * After the tables have been queried to create the primary object and its one-to-many
 * references, resolve all foreign key references to other models as the actual
 * object.
 *
 * @returns {Function}
 */
AbstractModel.prototype.generateResolveReferencesCallback_deprecated = function (options, callback) {
  var self = this;

  return function (err, instance) {
    if (err) {
      callback(err);
      return;
    }

    if (!instance) {
      callback();
      return;
    }

    // Set the response callback to be called once all reads have completed
    instance.setSourceOpCallback(callback);

    // Read from sub-models to populate one-to-many fields
    var modelMappings = self.mapping.sources.models;
    var model, targetField;
    var mapping;
    var MODEL_REFERENCE = self.FIELD_MAPPING_TYPES.MODEL_REFERENCE;
    var mappingFields = self.mapping.fields;

    for (var i in modelMappings) {
      model = self.sources.models[i].model;
      targetField = null;

      for (var j in mappingFields) {
        mapping = mappingFields[j];

        if (mapping.model !== model.name) {
          continue;
        }

        if (mapping.type === MODEL_REFERENCE) {
          targetField = j;
        }
      }

      // There is no field in the current sub-set using this model
      if (!targetField) {
        continue;
      }

      // The field was not included in the resulting view and therefore we do not
      // need to query this model
      if (!self.isFieldIncludedInResult(targetField, options.view, options.fields)) {
        continue;
      }

      instance.startSourceOp();
      model.read(
        {id: instance[targetField]},
        options,
        self.generateSubmodelReferenceClosure(targetField, instance)
      );
    }

    // Make sure at least one operation completes
    instance.startSourceOp();
    instance.finishSourceOp();
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
    newInst[field] = (refInstance) ? refInstance.toObject() : null;
    newInst.finishSourceOp();
  };
};

/**
 * Very similar to the one-to-one closure excepts takes the results and adds them
 * the array of submodels.
 *
 * @method generateOneToManyReadClosure
 * @param field
 * @param newInst
 * @returns {Function}
 */
AbstractModel.prototype.generateOneToManyReadClosure = function (field, newInst) {
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
    newInst[field] = newInst[field].concat(instances);
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