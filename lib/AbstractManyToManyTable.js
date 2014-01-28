/*******************************************************************************
 *
 * AbstractManyToManyTable.js
 *
 * Date:   December 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractTable = require('./AbstractTable.js');

 /**
  *
  *
  */
var AbstractManyToManyTable = function () {
  this.primaryTable = this.options.tableName;
  this.primaryJoinKey = this.primaryJoinKey || '';

  this.joinTable = this.joinTable || '';
  this.secondaryJoinKey = this.secondaryJoinKey || '';

  this.baseJoinQuery =
    'SELECT * ' +
    'FROM ' + this.primaryTable + ' p ' +
    'JOIN ' + this.joinTable + ' j ' +
    'ON p.' + this.primaryJoinKey + ' = j.' + this.secondaryJoinKey;


  // Inherits all of the properties of the AbstractTable
  AbstractTable.call(this);
};

AbstractManyToManyTable.prototype = new AbstractTable();


AbstractManyToManyTable.prototype.read = function (params, options, callback) {
  if (options && options.should_resolve_references) {
    options.limit = 1;
    this.readWithReferences(params, options, callback);
    return;
  } else {
    AbstractTable.prototype.read.call(this, params, options, callback);
  }
};

/**
 * Read a list of items
 *
 * @method list
 */
AbstractManyToManyTable.prototype.list = function (params, options, callback) {
  if (options && options.should_resolve_references) {
    this.readWithReferences(params, options, callback);
    return;
  } else {
    AbstractTable.prototype.list.call(this, params, options, callback);
  }
};

AbstractManyToManyTable.prototype.readWithReferences = function (params, options, callback) {
  var query = this.buildQuery(params, options);
  this.connection.sequelizeInstance.query(query).complete(callback);
};

AbstractManyToManyTable.prototype.buildQuery = function (params, options) {
  var query = this.baseJoinQuery;
  var whereClause;
  var isFirst = true;

  options = options || {};

  // Only supports equals where clause
  if (params) {
    whereClause = ' WHERE ';

    for (var i in params) {
      if (isFirst) {
        isFirst = false;
      } else {
        whereClause += ' AND ';
      }

      whereClause += i + ' = ' + params[i];
    }

    query += whereClause;
  }

  if (options.sortField && options.sortOrder) {
    query += ' ORDER BY p.' + options.sortField + ' ' + options.sortOrder;
  }

  // Default to a limit of 1 if none is specified
  query += ' LIMIT ' + (options.limit || 1);

  if (options.offset) {
    query += ' OFFSET ' + options.offset;
  }

  return query;
};



module.exports = AbstractManyToManyTable;