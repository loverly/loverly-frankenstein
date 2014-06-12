/*******************************************************************************
 *
 * MongoOdm.js
 *
 * Date: May 2014
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

/**
 * A dependency injection wrapper for the Mongo DB ODM to make it available as
 * a configurable service.
 *
 * @see http://mongoosejs.com
 * @constructor
 */
var MongoOdm = function (Mongoose, options) {
  this.name = '';

  this.options = {
    "database": "loverly",
    "user": 'root',
    "password": null,
    "host": "localhost",
    "port": 27017,
    "mongo_options": {} // Mongo options to pass to the connection
  };

  for (var i in options) {
    this.options[i] = options[i];
  }

  this.Mongoose = Mongoose;
  this.connection = null;
};

/**
 * Create a new mongoose mongo connection using createConnection so we can support
 * multiple mongo connections to different databases or servers in the future.
 *
 */
MongoOdm.prototype.initialize = function (callback) {
  var self = this;
  var mongoUri = this.generateUri(this.options);

  // Enable logging if the option is set
  if (this.options.logging) {
    this.Mongoose.set('debug', console.debug.bind(console));
  }

  this.connection = this.Mongoose.createConnection(
    mongoUri,
    this.options.mongo_options
  );

  // Validate that the connection opened properly before moving on
  this.connection.on('error', function (err) {
    callback(err);
  });

  this.connection.once('open', function () {
    console.debug('Mongo connection opened successfully: ', self.name);
    callback();
  });
};

/**
 * Based on the mongo URI standards, use the options to generate the connection
 * URI.  Will need to add replica set support when it is available.
 *
 * @method method
 */
MongoOdm.prototype.generateUri = function (options) {
  var mongoUri = 'mongodb://';
  mongoUri += options.user + ':' + options.password;
  mongoUri += '@' + options.host + ':' + options.port;
  mongoUri += '/' + options.database;
  return mongoUri;
};

/**
 * Create a model with the already initialized connection instance.
 *
 * Ensure that any instances confMongoOdm to our instance API
 *
 */
MongoOdm.prototype.createModel = function (name, definition, options) {
  // Pre-process schema definition to replace mongoose native types
  this.translateSchemaTypes(definition);

  // Create the schema and add bridge methods to conform to the frankenstein API
  var schema = new this.Mongoose.Schema(definition, options);
  this.conformMongooseInstanceApiToFrankenstein(schema);

  // Create the model and return it
  var model;
  if (this.connection) {
    model = this.connection.model(name, schema);
  } else {
    console.error('Failed to get connection for model', name);
  }

  return model;
};

/**
 * Rather than passing around the custom type constructors, just transform it here from
 * a string.
 *
 * Handles ObjectId, and Mixed types
 *
 * @method method
 */
MongoOdm.prototype.translateSchemaTypes = function (schema) {
  var ObjectId = this.Mongoose.Schema.Types.ObjectId;
  var Mixed = this.Mongoose.Schema.Types.Mixed;

  for (var i in schema) {
    if (schema[i].type === 'OBJECT_ID') {
      schema[i].type = ObjectId;
    } else if (schema[i].type === 'MIXED') {
      schema[i].type = Mixed;
    } else if (typeof schema[i] === 'Object' && !schema[i].isField) {
      this.translateSchemaTypes(schema[i]);
    }
  }
};

/**
 * Provide pseudo-prototype methods to conform mongoose instances to frankenstein's
 * API to avoid the overhead of generating new functions for every model.
 *
 */
MongoOdm.bridgeMethods = {
  flushChanges: function (callback) {
    this.save(callback);
  },
  destroy: function (callback) {
    callback({code: 500, msg: "Mongo Instance.destroy() NOT YET IMPLEMENTED"});
  }
}

/**
 * Provides a consistent instance API that is in-line with frankenstein's
 *
 * @method conformMongooseInstanceApiToFrankenstein
 */
MongoOdm.prototype.conformMongooseInstanceApiToFrankenstein = function (schema) {
  schema.methods.flushChanges = MongoOdm.bridgeMethods.flushChanges;
  schema.methods.destroy = MongoOdm.bridgeMethods.destroy;
};

module.exports = MongoOdm;