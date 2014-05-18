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
    Source: require('./lib/AbstractSource.js'),
    Model: require('./lib/AbstractModel.js'),
    SolrSearchModel: require('./lib/AbstractSolrSearchModel.js'),
    Instance: require('./lib/Instance.js'),
    Table: require('./lib/AbstractTable.js'),
    ManyToManyTable: require('./lib/AbstractManyToManyTable.js'),
    ApiClient: require('./lib/AbstractApiClient.js'),
    SolrClient: require('./lib/SolrClient.js'),
    File: require('./lib/AbstractFile.js'),
    Validator: require('./lib/AbstractValidator.js'),
    SequelizeOrm: require('./lib/SequelizeOrm.js'),
    MongoOdm: require('./lib/MongoOdm.js'),
    Collection: require('./lib/AbstractCollection.js')
  };

  // TODO: Think of a way to provide convenience methods to make it easier to use
  //       this library

  exports.createOrmConnection = function () {};
  exports.createModel = function () {};

  return exports;
}());