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

  /**
   * Define the "left" side of a many-to-many relationship.  This will be the
   * "parent" model in a parent-bridge-child relationship, but in an equal 
   * relationship, left and right make no difference.
   */
  this.leftModel = null;

  /**
   * Define the "right" side of a many-to-many relationship.  The child in a 
   * parent-bridge-child relationship.
   */
  this.rightModel = null;


  // Inherits all of the properties of the AbstractTable
  AbstractTable.call(this);
};

AbstractManyToManyTable.prototype = new AbstractTable();

/**
 * Initialize the models using the sequelize.js connection.
 *
 * @param ormWrapper A sequelize.js wrapper
 */
AbstractManyToManyTable.prototype.initialize = function (ormWrapper) {
  this.model = ormWrapper.createModel(this.name, this.schema, this.options);
  this.leftModel.initialize(ormWrapper);
  this.rightModel.initialize(ormWrapper);

  // Setup the many to many relationships for this model

  // TODO: We aren't taking advantage of sequelize's ability just yet, but we
  //       could in the future, thus the trouble of creating relationships and
  //       a separate AbstractTable layer

  this.leftModel.model.hasMany(this.rightModel, {joinTableModel: this.model});
  this.rightModel.model.hasMany(this.leftModel, {joinTableModel: this.model});
};

/**
 * Access the actual instances using the join relationship with the bridge table
 * from this model.
 *
 * @param callback
 */
AbstractManyToManyTable.prototype.readManyFromRightModel = function (callback) {
  var submodelGetter = 'get' + this.rightModel.name;
  this.leftModel[submodelGetter](selector, options)
    .success(function (instances) {
      callback(null, instances);
    })
    .error(callback);
};

/**
 * Access the actual instances using the join relationship with the bridge table
 * from this model.
 *
 * @param callback
 */
AbstractManyToManyTable.prototype.readManyFromLeftModel = function (callback) {
  var submodelGetter = 'get' + this.leftModel.name;
  this.rightModel[submodelGetter](selector, options)
    .success(function (instances) {
      callback(null, instances);
    })
    .error(callback);
};

module.exports = AbstractManyToManyTable;