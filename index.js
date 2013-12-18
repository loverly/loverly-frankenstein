/*******************************************************************************
 *
 * index.js 
 *
 * Date:   December 2013
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/	

/**
 * Allow access to all of the base classes through the loverly frankenstein
 * object returned when requiring this file.
 */
module.exports = (function () {
  var exports = {
    Model: require('./lib/AbstractModel.js'),
    Instance: require('./lib/Instance.js'),
    Table: require('./lib/AbstractTable.js'),
    //API: require('./lib/AbstractApi.js'),
    File: require('./lib/AbstractFile.js'),
    Validator: require('./lib/AbstractValidator.js'),
    Orm: require('./lib/Orm.js')
  };

  // A set of initialized ORM connections
  var connections = {};


  // TODO: Think of a way to provide convenience methods to make it easier to use
  //       this library

  exports.createOrmConnection = function () {};
  exports.createModel = function () {};

  return exports;
}());