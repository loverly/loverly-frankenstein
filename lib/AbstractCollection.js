/*******************************************************************************
 *
 * AbstractCollection.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractSource = require('./AbstractSource.js');

/**
 * Defines a mongoose collection schem in a mongoose-like definition language
 *
 * @class AbstractCollection
 * @constructor
 * @extends {AbstractSource}
 * @see  http://mongoosejs.com/docs/guide.html#options
 */
var AbstractCollection = function () {
  this.database = this.database || 'abstract';
  this.name = this.name || 'abstract';
  this.schema = this.schema || {
    "example_id": { type: 'ObjectId' }
  };

  // Model definition options
  this.options = this.options || {
    // See http://mongoosejs.com/docs/guide.html#options
  };

  // The model once a valid connection has been passed in
  this.model = null;

  // Whether or not this is the primary table/collection
  this.isPrimary = false;

  /**
   * During initialization this gets set to the active connection that the model
   * uses
   *
   * @property connection
   * @type {Mongoose}
   */
  this.connection = null;

  this.modifySchema(this.schema);
  AbstractSource.call(this);
};

AbstractCollection.prototype = new AbstractSource();

/**
 * Loop through the schema and add the isField flag to each field definition.
 *
 * @method method
 */
AbstractCollection.prototype.modifySchema = function (schema) {
  for (var i in schema) {
    if (
      typeof schema[i] === 'string' ||
      schema[i].type === String ||
      schema[i].type === Number ||
      schema[i].type === Date
    ) {
      schema[i].isField = true;
    } else {
      this.modifySchema(schema[i]);
    }
  }
};

/**
 *
 * @param isPrimary A boolean indicating whether or not this table is primary
 */
AbstractCollection.prototype.setIsPrimary = function (isPrimary) {
  this.isPrimary = isPrimary;
};

/**
 * Given a connected sequelize orm wrapper, use it to create the model.
 *
 * @param ormWrapper
 */
AbstractCollection.prototype.initialize = function () {
  for (var i in this.connections) {
    if (this.connections[i].name === this.database) {
      this.connection = this.connections[i];
    }
  }

  this.model = this.connection.createModel(this.name, this.schema, this.options);
  this.types = this.connection.getSchemaTypes();
};

/**
 * Creates an ODM instance and bind seed data to it
 *
 * @method createInstance
 * @param  {Object} data
 * @returns {Mongoose.Document}
 */
AbstractCollection.prototype.createInstance = function (data) {
  return new this.model(data);
};

/**
 * Read from the mongoose ODM.
 *
 * @method read
 * @param {Object} param Query parameters
 * @param {Object} options Sequelize options, if any
 * @returns {undefined}
 */
AbstractCollection.prototype.read = function (params, options, callback) {
  // Coerce the field types to the proper object ID type
  //if (params._id) {
  //  params._id = new this.types.ObjectId(params._id);
  //}

  this.model.findOne(params, callback);
};

/**
 * Read a list of items
 *
 * @method list
 */
AbstractCollection.prototype.list = function (params, options, callback) {
  var query;

  // Coerce the field types to the proper object ID type
  //if (params._id) {
  //  params._id = new this.types.ObjectId(params._id);
  //}

  // Convert an array to the proper query format
  for (var i in params) {
    if (params[i] instanceof Array) {
      params[i] = {$in: params[i]};
    }
  }

  query = this.model.find(params);

  if (options.limit) {
    query.limit(options.limit);
  }

  if (options.offset) {
    query.skip(options.offset);
  }

  var sortOrder;
  if (options.sortField && options.sortOrder) {
    sortOrder = (options.sortOrder === 'ASC') ? '' : '-';
    query.sort(sortOrder + options.sortField);
  }

  query.exec(callback);
};

/**
 * Count the number of items based on the query params
 *
 * @method list
 */
AbstractCollection.prototype.count = function (params, options, callback) {
  this.model.count(params, callback);
};

module.exports = AbstractCollection;
