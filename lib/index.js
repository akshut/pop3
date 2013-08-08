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

}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.patterns = {
    ok: /^\+OK\s(.*)\r\n$/i,
    okML: /^\+OK\s.*\r\n((?:(?:[^\.][^\r]*)|(?:\.\.[^\r]*)\r\n)*)\.\r\n/i,
    err: /^\-ERR\s(.*)\r\n$/i,
    garbage: /^(.*)\r\n$/,
};

POP3Client.prototype.onData = function(data) {
    var self = this;

    var dataChunk = data.toString("ascii");
    self.buffer += dataChunk;

    var match;

    var success = false;
    var reply = true;
    switch (self.state) {
        case 0:
            { // initial state 

                if (match = self.patterns.ok.exec(self.buffer)) {
                    self.state = 100;
                    self.greeting = match[1];
                    success = true;
                } else if (match = self.patterns.err.exec(self.buffer)) {
                    self.state = 10;
                    self.greeting = match[1];
                } else if (match = self.patterns.garbage.exec(self.buffer)) {
                    self.state = 1; // error 
                    self.greeting = "protocol violation";
                } else reply = false;

                if (reply) {
                    self.emit('response', 'connection', self.state == 100, self.greeting);
                    self.buffer = "";
                }
            }
            break;

        case 100:
            { // authorization state

                if (match = self.patterns.ok.exec(self.buffer)) {
                    self.state = 100; // authorization state
                    success = true;
                    response = match[1];
                } else if (match = self.patterns.err.exec(self.buffer)) {
                    self.state = 100; // incorrect login, retry
                    response = match[1];
                } else if (match = self.patterns.garbage.exec(self.buffer)) {
                    self.state = 101; // error 
                    response = "";
                } else reply = false;

                if (reply) {
                    self.emit('response', 'authorize', success, response);
                    self.buffer = "";
                }
            }
            break;

        case 200:
            { // authorization state, after credentials sent, a positive response at this point would indicate successful login

                if (match = self.patterns.ok.exec(self.buffer)) {
                    self.state = 1000; // transaction state
                    success = true;
                    response = match[1];
                } else if (match = self.patterns.err.exec(self.buffer)) {
                    self.state = 100; // incorrect login, retry
                    response = match[1];
                } else if (match = self.patterns.garbage.exec(self.buffer)) {
                    self.state = 101; // error 
                    response = "";
                } else reply = false;

                if (reply) {
                    self.emit('response', 'login', success, response);
                    self.buffer = "";
                }
            }
            break;

        case 1000:
            { // transaction state, single line
                if (match = self.patterns.ok.exec(self.buffer)) {
                    self.state = 1000; // back to transaction state
                    success = true;
                    response = match[1];
                } else if (match = self.patterns.err.exec(self.buffer)) {
                    self.state = 1000; // error response, back to transaction state
                    response = match[1];
                } else if (match = self.patterns.garbage.exec(self.buffer)) {
                    self.state = 1001; // error 
                    response = "";
                } else reply = fale;

                if (reply) {
                    self.emit('response', 'command', success, response);
                    self.buffer = "";
                }
            }
            break;

        case 2000:
            { // transaction state, multi line
                if ((self.buffer.substr(0, 3).toLowerCase() === '+ok') &&
                    self.buffer.substr(self.buffer.length - 5) === "\r\n.\r\n") {
                    var idx = self.buffer.indexOf('\r\n') + 2,
                        n = self.buffer.length;
                    console.log('n: ' + n + ' idx: ' + idx);
					response = self.buffer.substr(idx, n - idx - 5);
					console.log(response);
					response="";
                	self.state = 1000; // back to transaction state, single line
                	success = true;
            } else if (match = self.patterns.err.exec(self.buffer)) {
                self.state = 1000; // error response, back to transaction state single line
                response = match[1];
            } else reply = false;

            if (reply) {
                self.emit('response', 'data', success, response);
                self.buffer = "";
            }
    }
    break;
}
};

POP3Client.prototype.connect = function(host, username, password, secure, port) {

    var self = this;

    if (!secure) secure = false;
    if (!port) port = secure ? 993 : 110;

    self.socket = new net.connect({
        host: host,
        port: port
    });

    var onDataFunc = POP3Client.prototype.onData.bind(self);

    self.socket.on('data', onDataFunc);
    self.state = 0; // initial, pre authorization, waiting for greeting
    self.buffer = "";

    return this;
};

POP3Client.prototype.sendCommand = function(verb, param) {

    var self = this;

    var command = verb + (param ? ' ' + param : '') + '\r\n';

    self.socket.write(command);
}

POP3Client.prototype.user = function(username) {

    var self = this;

    if (self.state != 100) return false;

    self.buffer = "";

    self.sendCommand("USER", username);
};

POP3Client.prototype.pass = function(password) {

    var self = this;

    if (self.state != 100) return false;

    self.state = 200;
    self.buffer = "";

    self.sendCommand("PASS", password);
};

POP3Client.prototype.list = function() {

    var self = this;

    if (self.state != 1000) return false;

    self.state = 2000; //multiline response
    self.buffer = "";

    self.sendCommand("LIST");
};

POP3Client.prototype.quit = function() {

    var self = this;
    self.buffer = "";

    self.sendCommand("QUIT");
};
