/*

Node POP3

*/

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    net = require('net');

function POP3Client(params) {
    EventEmitter.call(this);
    var self = this;
    self.options = params;

}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

