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
  throw new Error("READ NOT YET IMPLEMENTED");
};

/**
 * Read a list of items
 *
 * @method list
 */
AbstractCollection.prototype.list = function (params, options, callback) {
  throw new Error("READ NOT YET IMPLEMENTED");
};

/**
 * Read a list of items
 *
 * @method list
 */
AbstractCollection.prototype.count = function (params, options, callback) {
  throw new Error("READ NOT YET IMPLEMENTED");
};

module.exports = AbstractCollection;
