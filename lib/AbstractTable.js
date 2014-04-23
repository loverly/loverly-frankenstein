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
  query.offset = options.offset;
  query.order = options.randomSeed ? ('rand(' + options.randomSeed + ')') : (options.sortField + ' ' + options.sortOrder);

  this.model
    .findAll(query)
    .complete(callback);
};

/**
 * Reads a list of items per ID.  This is used when the user is retrieving a list
 * of items that has a single sub-item.  For example, retrieving a list of products
 * where each product has a single image.
 *
 * @method listForListDecoration
 */
// AbstractTable.prototype.listForDecoration = function (foreignKey, ids, options, callback) {
//   // Query for the list of items - no limit, offset, or sort needed because we
//   // need all the matching elements since this is one-to-one
//   var query = {where: {}};
//   query.where[foreignKey] = ids;
//   this.model
//     .findAll(query)
//     .complete(callback);
// };

/**
 * Read a list of items
 *
 * @method list
 */
AbstractTable.prototype.count = function (params, options, callback) {

  var query = {where: params};

  // Cannot have an empty query object
  query.where = (params instanceof Array) ? null : params;

  this.model
    .count(query)
    .complete(callback);
};

AbstractTable.prototype.buildQuery = function (params, options) {
  var query = this.baseQuery;
  var whereClause;
  var isFirst = true;
  var val;

  options = options || {};

  var alias = (options.alias) ? options.alias + '.' : '';

  // Only supports equals and IN in the where clause
  if (params) {
    whereClause = ' WHERE ';

    for (var i in params) {
      if (isFirst) {
        isFirst = false;
      } else {
        whereClause += ' AND ';
      }

      val = (typeof params[i] === 'string') ? "'" + params[i] + "'" : params[i];

      if (val instanceof Array) {
        var processed = [];
        var processedVal;
        for (var j in val) {
          processedVal = (typeof val[j] === 'string') ? "'" + val[j] + "'" : val[j];
          processed.push(processedVal);
        }

        whereClause += alias + i + ' IN (' + processed.join(',') + ')';
      } else if (typeof val === 'object' && val !== null && val.$ne) {
        val = val.$ne;
        val = (typeof val === 'string') ? "'" + val + "'" : val;
        whereClause += alias + i + ' <> ' + val;
      } else {
        whereClause += alias + i + ' = ' + val;
      }
    }

    query += whereClause;
  }

  if (options.groupBy) {
    query += ' GROUP BY ' + options.groupBy;
  }

  if (options.randomSeed){
    query += ' ORDER BY rand(' + options.randomSeed + ')';  
  }
  else if (options.sortField && options.sortOrder) {
    query += ' ORDER BY ' + alias + options.sortField + ' ' + options.sortOrder;
  }

  // Default to a limit of 1 if none is specified
  if (options.limit !== null) {
    query += ' LIMIT ' + (options.limit || 1);
  }

  if (options.offset) {
    query += ' OFFSET ' + options.offset;
  }

  return query;
};

module.exports = AbstractTable;
