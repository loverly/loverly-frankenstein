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

  // The sequelize connection
  this.connection = null;

  // Whether or not this is the primary query table
  this.isPrimary = false;

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
    if (connections[i].name === this.database) {
      this.connection = this.connections[i];
    }
  }

  // For backwards compatability
  connection = this.connection || ormWrapper;

  this.model = connection.createModel(this.name, this.schema, this.options);
};

/**
 * Read from the sequelize ORM. A table is always a sub-model and therefore
 * gets its id from the parent model. 
 *  
 * @method read
 * @param {Object} param Query parameters
 * @param {Object} options Sequelize options, if any
 * @returns {undefined}
 */
AbstractTable.prototype.read = function (params, options, callback) {
  var i;
  var query = {where: params};

  query.where.id = query.where.parent_id;
  delete query.where.parent_id;

  this.model
    .find(query, options)
    .success(function (instance) {
      callback(null, instance);
    })
    .error(callback);
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


