/*******************************************************************************
 *
 * AbstractTable.js
 *
 * Date: November 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractSource = require('./AbstractSource.js');

/**
 * Use a MySQL ORM to define a physical table schema.
 *
 * @class AbstractTable
 * @constructor
 * @extends {AbstractSource}
 */
var AbstractTable = function () {
  this.database = this.database || 'abstract';
  this.name = this.name || 'abstract';
  this.schema = this.schema || {
    "example_id": {
      "type": "INTEGER",
      "primaryKey": true,
      "autoIncrement": true
    },
    "example_field": {
      "type": "ENUM",
      "type_value": ["admin", "publisher", "advertiser", "user", "investor"],
      "allowNull": false
    }
  };

  // Model definition options
  this.options = this.options || {
    freezeTableName: true,
    tableName: 'example'
  };

  // The model once a valid sequelize connection has been passed in
  this.model = null;

  // Whether or not this is the primary query table
  this.isPrimary = false;

  /**
   * During initialization this gets set to the active connection that the model
   * uses
   *
   * @property connection
   * @type {Sequelize}
   */
  this.connection = null;

  AbstractSource.call(this);
};

AbstractTable.prototype = new AbstractSource();

/**
 *
 * @param isPrimary A boolean indicating whether or not this table is primary
 */
AbstractTable.prototype.setIsPrimary = function (isPrimary) {
  this.isPrimary = isPrimary;
};

/**
 * Given a connected sequelize orm wrapper, use it to create the model.
 *
 * @param ormWrapper
 */
AbstractTable.prototype.initialize = function (ormWrapper) {
  var connection;

  for (var i in this.connections) {
    if (this.connections[i].name === this.database) {
      this.connection = this.connections[i];
    }
  }

  // For backwards compatability
  connection = this.connection || ormWrapper;

  this.model = connection.createModel(this.name, this.schema, this.options);
};

/**
 * Creates an ORM instance and bind seed data to it
 *
 * @method createInstance
 * @param  {Object} data
 * @returns {Sequelize.Instance}
 */
AbstractTable.prototype.createInstance = function (data) {
  return this.model.build(data);
};

/**
 * Read from the sequelize ORM.
 *
 * @method read
 * @param {Object} param Query parameters
 * @param {Object} options Sequelize options, if any
 * @returns {undefined}
 */
AbstractTable.prototype.read = function (params, options, callback) {
  var query = {where: params};

  this.model
    .find(query, options)
    .complete(callback);
};

/**
 * Read a list of items
 *
 * @method list
 */
AbstractTable.prototype.list = function (params, options, callback) {

  var query = {where: params};

  // Cannot have an empty query object
  query.where = (params instanceof Array) ? null : params;

  // Set the options into the query object
  query.limit = options.limit;
  options.offset = options.offset;
  options.order = options.sortField + ' ' + options.sortOrder;

  this.model
    .findAll(query)
    .complete(callback);
};

/**
 * Read
 *
 * @param query
 * @param options
 * @param callback
 */
AbstractTable.prototype.readOne = function (query, options, callback) {
  this.model
    .find(query, options)
    .success(function (instance) {
      callback(null, instance);
    })
    .error(callback);
};

AbstractTable.prototype.readMany = function (selector, options, callback) {
  this.model
    .findAll(selector, options)
    .success(function (instances) {
      callback(null, instances);
    })
    .error(callback);
};

module.exports = AbstractTable;
