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

  this.baseQuery =
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
  options = options || {};

  if (options.should_resolve_references) {
    options.sortField = 'p.' + options.sortField;

    if (options.is_limited_by_key) {
      this.listItemsForKeys(params, options, callback);
    } else {
      this.readWithReferences(params, options, callback);
    }
  } else {
    AbstractTable.prototype.list.call(this, params, options, callback);
  }
};

/**
 * Reads a list of items per ID.  This is used when the user is retrieving a list
 * of items that has a list of sub-items.  For example, retrieving a list of albums
 * with all of the tracks as array properties on each of the albums.
 *
 * A union of queries is used to enforce a per-record limit on the number of
 * dependent records that are returned.
 *
 * @method listForListDecoration
 */
AbstractManyToManyTable.prototype.listItemsForKeys = function (params, options, callback) {
  // Copy options
  var i, j;

  var foreignKey;
  var ids;

  var opts = {};
  for (i in options) {
    opts[i] = options[i];
  }

  // Delete the sort field and sort order for the union
  delete opts.sortField;
  delete opts.sortOrder;

  for (i in params) {
    // TODO: This is a hack - how do we know this is the right foreign key?
    if (params[i] instanceof Array) {
      foreignKey = i;
      ids = params[i];
    }
  }

  // Create an array of queries to union together
  var queries = [];
  var query;

  for (i in ids) {
    query = {};

    for (j in params) {
      if (j !== foreignKey) {

      }
    }

    query[foreignKey] = ids[i];
    queries.push(this.buildQuery(query, opts));
  }

  // We use a union of queri
  var finalQuery = queries.join(' UNION ');
  this.connection.sequelizeInstance.query(finalQuery).complete(callback);
};

AbstractManyToManyTable.prototype.readWithReferences = function (params, options, callback) {
  var query = this.buildQuery(params, options);
  this.connection.sequelizeInstance.query(query).complete(callback);
};



module.exports = AbstractManyToManyTable;