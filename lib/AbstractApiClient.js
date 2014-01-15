/*******************************************************************************
 *
 * AbstractApiClient.js
 *
 * Date:   Janurary 2014
 * Author: Brandon Eum <brandon@lover.ly>
 *
 ******************************************************************************/

var AbstractSource = require('./AbstractSource.js');

/**
 * A common set of interfaces for an API client wrapper
 *
 * @class AbstractApiClient
 * @constructor
 * @extends {AbstractSource}
 */
var AbstractApiClient = function () {
  AbstractSource.call(this);
};

AbstractApiClient.prototype = new AbstractSource();

module.exports = AbstractApiClient;