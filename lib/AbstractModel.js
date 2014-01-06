/*******************************************************************************
 *
 * AbstractModel.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var Instance = require('./Instance.js');

/**
 * Define an arbitrarily complex model that maps to one or more sources of data.
 *
 * @constructor
 */
var AbstractModel = function () {
  this.name = this.name || 'Abstract';

  // Properties for dealing with a submodel - if this is a submodel, reads occur
  // via a foreign key
  this.isSubmodel = false;
  this.foreignKey = '';

  // A constructor for a model instance - extends Instance
  this.Instance = Instance;

  // Constants that define the various way a field can be mapped
  this.MAPPING_TYPES = {
    "DB_FIELD": "db_field",
    "VIRTUAL_FIELD": "virtual_field",
    "SUBMODEL_PROPERTY": "submodel_property",
    "SUBMODEL_ARRAY": "submodel_array",
    "API_OBJECT": "api_object"
  };

  // Node validator that will be set through property injection
  this.validator = null;
  this.check = null;

  // The "ideal" entity definition - independent of the underlying data representation
  this.definition = this.definition || {
    "example1": {
      "type": "STRING",
      "default": "value",
      "required": false,
      "views": ["basic"],
      "constraints": {
        "len": [1, 3]
      }
    },
    "example2": {"type": "STRING", "default": "value"},
    "complexField": {
      "field1": {"type": "STRING", "constraints": {"isEmail": true}}
    },
    "oneToManyField": []
  };

  // Only custom mappings are necessary, otherwise it just assumes the property
  // can be found on the primary table
  this.mapping = this.mapping || {
    // Keep fields as its own key to make it easy to map fields to sources
    "fields": {
      "example1": {
        "type": this.MAPPING_TYPES.DB_FIELD,
        "database": "db1",
        "table": "Table1",
        "alias": "tastemaker"
      },

      // Allow arbitrary projection of flat tables into complex resources
      // using mongo-style dot notation
      // Note: periods are restricted in field names
      "complexField.field1": {
        "type": this.MAPPING_TYPES.DB_FIELD,
        "database": "db1",
        "table": "Table1",
        "alias": "user_id"
      },
      "oneToManyField": {
        "type": this.MAPPING_TYPES.SUBMODEL_ARRAY,
        "model": "SubModel1"
      }
    },

    // Define how tables and other data sources relate to each other
    "sources": {
      "databases": {
        "db1": {
          "tables": {
            "Table1": {"is_primary": true}, // Only one table can be primary
            "Table2": {"foreign_key": "column2", "relationship": "one-to-one"}
          }
        },
        "db2": {
          "tables": {
            // The foreign key defines the relationship to the primary table in
            // db1
            // Many-to-many relationships are forbidden across data sources
            "Table1": {"foreign_key": "column3", "relationship": "one-to-many"},
            "Table2": {"foreign_key": "column2", "relationship": "one-to-many"}
          }
        }
      },
      // Submodels define a relationship to a complex sub-document that has its
      // own data sources
      "models": {
        "SubModel1": {
          "foreign_key": "user_id",
          "relationship": "one-to-many"
        }
      },
      "apis": {
        "api1": {
          // ...
        }
      }
    }
  };

  // Keep references to all of the database and api models that make up this
  // translational layer model
  this.sources = this.sources || {
    // Define what databases this model expects
    "databases": {
      "db1": {
        "connection": null, // The initialized database connection
        "tables": {}
      },
      "db2": {
        "connection": null, // The initialized database connection
        "tables": {}
      }
    },
    "apis": {
      "api1": {
        "client": null,
        "sources": {}
      }
    },
    "models": {
      "SubModel1": {
        "model": null // The initialized model
      }
    }
  };
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
  if (this.sources.databases && this.sources.databases[dbName]) {
    this.sources.databases[dbName].connection = connection;
  }
};

/**
 * Pass the appropriate fields to the Instance constructor.
 *
 */
AbstractModel.prototype.createInstance = function () {
  return new this.Instance(
    this,
    this.validator
  );
};

/**
 * Set the connections into the ORM tables and initialize them.
 *
 */
AbstractModel.prototype.initialize = function () {
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
 * Keep it simple for now and do not account for other databases or APIs for
 * data.  We can fill that in later.  Also do not allow joins in lists,
 * require that they explicitly look for sub-documents with sub-routes.
 *
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractModel.prototype.list = function (params, options, callback) {
  // Use ORM functions to pull a listing fo this type of model
  // @TODO: This is the most difficult to accomplish with joins
  // @TODO: Create an option for populating sub-fields
  // @TODO: One-to-one mappings are easy, but one-to-many requires more thought
  // @TODO:   do we include all child documents or just a few?
  var i, j, query;
  var limit = (options && options.limit) ? options.limit : 25;
  var offset = (options && options.offset) ? options.offset : 0;
  var sortField  = (options && options.sort_field) ? options.sort_field : 'id';
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
  }
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
    }
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
 * @param data
 * @param callback
 */
AbstractModel.prototype.multipartCreate = function (data, callback) {
  throw new Error('Not Implemented');
};

/**
 *
 * @param params
 * @param options
 * @param callback
 */
AbstractModel.prototype.read = function (params, options, callback) {
  var i, j, query;

  // Create a new instance
  var newInstance = this.createInstance();
  newInstance.setSourceOpCallback(callback);

  // Add all of the data to the instance that is sourced from DB tables
  var dbMappings = this.mapping.sources.databases;
  var table, tableMappings;

  for (i in dbMappings) {
    tableMappings = dbMappings[i].tables;

    // Loop through all of the tables and build the instance, marrying all of
    // the data from the disparate sources
    for (j in tableMappings) {
      table = this.sources.databases[i].tables[j];
      newInstance.startSourceOp();

      // Set the query structure for the ORM appropriately
      if (table.isPrimary) {
        query = {where: {id: params.id}};
      } else {
        query = {where: {}};
        query.where[tableMappings[j].foreign_key] = params.id;
      }

      // Currently sub-models only allow one level of nesting
      if (this.isSubmodel) {
        query.where[this.foreignKey] = params.parent_id;
      }

      table.readOne(
        query,
        options,
        this.generateOneToOneReadClosure(table, newInstance, table.isPrimary)
      );
    }
  }

  // Do not included nested submodel arrays
  if (options && options.ignore_nested_arrays) {
    return;
  }

  // Read from sub-models to populate one-to-one and one-to-many fields
  var modelMappings = this.mapping.sources.models;
  var model, fields, targetField;
  for (i in modelMappings) {
    model = this.sources.models[i].model;

    fields = this.mapping.fields;
    for (j in fields) {
      if (fields[j].type === this.MAPPING_TYPES.SUBMODEL_ARRAY && fields[j].model === model.name) {
        targetField = j;
      }
    }

    // There is no field in the current sub-set using this model
    if (!targetField) {
      continue;
    }

    if (modelMappings[i].relationship === 'one-to-many') {
      newInstance.startSourceOp();
      model.list({parent_id: params.id}, options, this.generateOneToManyReadClosure(targetField, newInstance));
    }
  }
};

/**
 * Create a closure and return a callback with a common structure for all read
 * operations from a database table.
 *
 * @param table
 * @param newInst
 * @param isPrimary The primary table must have a record for this instance
 * @returns {Function}
 */
AbstractModel.prototype.generateOneToOneReadClosure = function (table, newInst, isPrimary) {
  return function (err, ormInstance) {
    // Another data source already had an error
    if (newInst.isSourceOpFailed()) {
      return;
    }

    // This is the primary table but the record for this instance was not found
    if (isPrimary && !ormInstance) {
      newInst.failSourceOp({code: 404, error: "Not found"});
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
 * Very similar to the one-to-one closure. Tracks how many pending reads are left
 * and exits appropriately on error.
 *
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
  this.read(params, null, function (err, instance) {
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
  this.read(params, null, function (err, instance) {
    if (err || !instance) {
      callback(err);
      return;
    }

    instance.destroy(callback);
  });
};

module.exports = AbstractModel;