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
  if (options && options.should_resolve_references) {
    options.sortField = 'p.' + options.sortField;
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



module.exports = AbstractManyToManyTable;