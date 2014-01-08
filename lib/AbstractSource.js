/**
 * @module loverly-frankenstein
 */

/**
 * A
 * @class AbstractSource
 * @constructor
 */
var AbstractSource = function () {
  this.type = this.type || null;
  this.name = this.name || null;

  this.connections = [];

  this.isSubSource = false;
  this.foreignKey = null;

};

AbstractSource.prototype.setForeignKey = function (fk) {
  this.isSource = true;
  this.foreignKey = fk;
};


AbstractSource.prototype.addConnections = function (conns) {
  for (var i in conns) {
    this.addConnection(conns[i]);
  }
};

AbstractSource.prototype.addConnection = function (conn) {
  this.connections.push(conn);
};

// Return the data values of the source
AbstractSource.prototype.toObject = function () {

};

AbstractSource.prototype.initialize = function () {
  
};

AbstractSource.prototype.list = function (params, options, callback) {

};

module.exports = AbstractSource;

// INSTANCE

// bindFromSource
// bindSourceInstanceToSelf
// get - using dot notation

 