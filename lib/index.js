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

    self.connected = false;
    self.socket = null;

    self.state = 0; 
    self.multiline = false;
    self.bufferState = 0;

}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.patterns = {
	ok: /^\+OK\s(.*)\r\n$/i,
	okML: /^\+OK\s(.*)\r\n(([^\.][^\r]*|\.\.[^\r]*)\r\n)*\.\r\n$/i,
	err: /^\-ERR\s(.*)\r\n$/i,
	garbage: /^(.*)\r\n$/, 
};

POP3Client.prototype.connect = function(host, username, password, callback, secure, port) {

	var self = this;

	if (!secure) secure = false;
	if (!port) port = secure ? 993 : 110;

	socket = new net.createConnection(port, host);
	self.state = 0; // initial, pre authorization, waiting for greeting
	self.buffer = "";
	self.bufferState = 0;

	socket.on("data", function(data) {

		var dataChunk = data.toString("ascii");
		self.buffer += dataChunk;

		var match;

		switch (self.state) {
			case 0: { // initial state 
				
				if (match = patterns.ok.test(self.buffer)) {
					self.state = 100;
					self.greeting = match[1];
					self.buffer = "";
				}
				else if (match = patterns.err.test(self.buffer)) {
					self.state = 10;
					self.greeting = match[1];
					self.buffer = "";
				}
				else if (match = patterns.garbage.test(self.buffer)) {
					self.state = 1; // error 
					self.greeting = "protocol violation";
				}
			}
			break;

			case 100: { // authorization state
				
				if (match = patterns.ok.test(self.buffer)) {
					self.state = 100; // transaction state
					response = match[1];
				}
				else if (match = patterns.err.test(self.buffer)) {
					self.state = 100; // incorrect login, retry
					response = match[1];
				}
				else if (match = patterns.garbage.test(self.buffer)) {
					self.state = 101; // error 
				}
			}
			break;

			case 200: { // authorization state, after credentials sent, a positive response at this point would indicate successful login
				
				if (match = patterns.ok.test(self.buffer)) {
					self.state = 1000; // transaction state
					response = match[1];
				}
				else if (match = patterns.err.test(self.buffer)) {
					self.state = 100; // incorrect login, retry
					response = match[1];
				}
				else if (match = patterns.garbage.test(self.buffer)) {
					self.state = 101; // error 
				}
			}
			break;
			
			case 1000: { // transaction state, single line
				if (match = patterns.ok.test(self.buffer)) {
					self.state = 1000; // back to transaction state
				}
				else if (match = patterns.err.test(self.buffer)) {
					self.state = 1000; // error response, back to transaction state
				}
				else if (match = patterns.garbage.test(self.buffer)) {
					self.state = 1001; // error 
				}
			}
			break;

			case 2000: { // transaction state, multi line
				if (match = patterns.okML.test(self.buffer)) {
					self.state = 1000; // back to transaction state, single line
				}
				else if (match = patterns.err.test(self.buffer)) {
					self.state = 1000; // error response, back to transaction state single line
				} 
				else if (match = patterns.garbage.test(self.buffer)) { // TODO: gobble response and reset ?
					self.state = 1001; // error in transaction state
				}
			}
			break;
		}
	});
};

