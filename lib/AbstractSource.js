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

  // This is what we eventually want to use long term, store connections by name
  this.connectionLookup = {};

  this.isSource = false;
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
  this.connectionLookup[conn.name] = conn;
};

/**
 * Return the connection referred to by the given name.
 *
 * @method getConnection
 * @param {String} name Name of the connection to retrieve
 */
AbstractSource.prototype.getConnection = function (name) {
  return this.connectionLookup[name];
};

// Return the data values of the source
AbstractSource.prototype.toObject = function () {

};

AbstractSource.prototype.initialize = function () {

};

AbstractSource.prototype.list = function (params, options, callback) {
  var err = 'Calling undefined list function for Source ' + this.name;
  console.error(err);
  callback({
    code: 400,
    msg: err
  });
};

AbstractSource.prototype.read = function (params, options, callback) {
  var err = 'Calling undefined read function for Source ' + this.name;
  console.error(err);
  callback({
    code: 400,
    msg: err
  });
};

AbstractSource.prototype.count = function (params, options, callback) {
  var err = 'Calling undefined count function for Source ' + this.name;
  console.error(err);
  callback({
    code: 400,
    msg: err
  });
};

module.exports = AbstractSource;

// INSTANCE

// bindFromSource
// bindSourceInstanceToSelf
// get - using dot notation

