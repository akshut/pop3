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

    self.buffer = "";
    self.newCommand = true;

    var PROTOCOLEVENT = "pop3";
}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.onProtocolEvent = function() {
    var type = arguments[0];
    switch (type) {
        case 'reply':
            break;
        case 'error':
            break;
        case 'data':
            break;
        case 'data-line':
            break;
        case 'data-chunk':
            break;
    }
}

POP3Client.prototype.onData = function(data) {
    var self = this;

    var dataChunk = data.toString("ascii");
    self.buffer += dataChunk;

    var match;

    var success = false;
    var errorCode = 0;
    var errorMessage = "Protocol error";
    var reply = false;
    var idx, pos;

    if (self.newCommand) {
        self.chunkNo = 1;
        idx = self.buffer.indexOf('\r\n');
        if (idx > 0) {
            reply = true;
            if (self.buffer.substr(0, 3).toUpperCase() === '+OK')
                success = true;
            else if (self.buffer.substr(0, 3).toUpperCase() === '-ERR')
                success = false;
            else {
                reply = false;
                errorCode = 1;
            }

            self.newCommand = false;
            self.commandResponse = self.buffer.substr(0, idx);
            self.commandResponseParams = self.commandResponse.split(' ');
            self.buffer = self.buffer.substr(idx + 2);

            self.emit(PROTOCOLEVENT, 'reply', success, errorCode, errorMessage);

            if (self.multi && !success && !errorCode) self.multi = false;
        }
    } else self.chunkNo++;

    if (errorCode) {
        self.buffer = "";
    } else if (!self.newCommand && self.buffer.length > 0) {
        if (!self.multi) {
            errorCode = 2;
        } else if ((!self.endOfResponse) == false) {
            errorCode = 3;
        } else if (self.parseLine) {
            pos = 0;
            do {
                idx = self.buffer.indexOf('\r\n', pos);
                if (idx < 0) break;
                var line = self.buffer.substr(pos, idx - pos);
                if (line === '.') {
                    // end of response
                    self.endOfResponse = true;
                    if (self.buffer.length > idx + 2) {
                        errorCode = 3;
                    } else {
                        self.emit(PROTOCOLEVENT, 'data-line', 'end');
                        reply = true;
                    }
                } else {
                    self.emit(PROTOCOLEVENT, 'data-line', 'line', line);
                }
                pos = idx + 2;
            } while (true);
        } else { //multi line responses like retr and top 
            var dotCR = self.buffer.substr(self.buffer.length - 3) === ".\r\n";
            var dotDotCR = self.buffer.substr(self.buffer.length - 4) === "..\r\n";
            if (dotCR && !dotDotCR) {
                self.endOfResponse = true;
            }
            var chunk = self.buffer.substr(0, self.buffer.length - (self.endOfResponse ? 3 : 0));
            // replace dot from bol
            if (self.chunkNo === 1) {
                if (chunk.substr(0, 2) == '..') chunk = chunk.substr(1); // strip escape dot from first line
            } else {
                chunk = chunk.replace(/\r\n\.\./g, '\r\n.'); // strip escape dot everywhere else
            }
            if (self.sendChunked) {
                self.emit(PROTOCOLEVENT, 'data-chunk', 'chunk', chunk);
                self.buffer = "";
                if (self.endOfResponse) {
                    self.emit(PROTOCOLEVENT, 'data-chunk', 'end');
                    reply = true;
                }
            } else {
                self.emit(PROTOCOLEVENT, 'data', 'data', chunk);
                self.buffer = "";
                if (self.endOfResponse) {
                    self.emit(PROTOCOLEVENT, 'data', 'end');
                    reply = true;
                }
            }
        }
    }

    if (errorCode) {
        self.emit(PROTOCOLEVENT, 'error', errorCode, errorMessage);
    }

    if (reply) {
        //state transitions
        var prevState = self.state;
        var newState = self.state;
        switch (self.state) {
            case 0:
                { // initial state 
                    if (success) {
                        newstate = 100;
                    } else if (!errorCode) {
                        newstate = 10;
                    } else if (!self.newCommand) {
                        newstate = 1; // error 
                    }
                }
                break;

            case 100:
                { // authorization state
                    if (success) {
                        newstate = 100;
                    } else if (!errorCode) {
                        newstate = 100;
                    } else if (!self.newCommand) {
                        newstate = 101; // error 
                    }
                }
                break;

            case 200:
                { // authorization state, after credentials sent, a positive response at this point would indicate successful login

                    if (success) {
                        newstate = 1000;
                    } else if (!errorCode) {
                        newstate = 100;
                    } else if (!self.newCommand) {
                        newState = 101; // error 
                    }
                }
                break;

            case 1000:
                { // transaction state, single line
                    if (success) {
                        newState = 1000;
                    } else if (!errorCode) {
                        newState = 1000;
                    } else if (!self.newCommand) {
                        newState = 1001; // error 
                    }
                }
                break;

            case 2000:
                { // transaction state, multi line
                    if (success) {
                        newState = 1000;
                    } else if (!errorCode) {
                        newState = 1000;
                    } else if (!self.newCommand) {
                        newState = 1001; // error 
                    } 
                }
                break;

            case 3000:
                { // transaction state, quit
                    if (success) {
                        newState = 10000;
                    } else if (!errorCode) {
                        newState = 10001;
                    } else if (!self.newCommand) {
                        newState = 10001; // error 
                    } 
                }
                break;
        }

        if (prevState != newstate) {
            self.state = newState;
            self.emit('state', 'connection', success, errorCode, prevState, newState);
        }
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

    self.buffer = "";
    self.newCommand = true;

    var command = verb + (param ? ' ' + param : '') + '\r\n';

    self.socket.write(command);
}

POP3Client.prototype.user = function(username) {

    var self = this;

    if (self.state != 100) return false;

    self.sendCommand("USER", username);
};

POP3Client.prototype.pass = function(password) {

    var self = this;

    if (self.state != 100) return false;

    self.state = 200;

    self.sendCommand("PASS", password);
};

POP3Client.prototype.list = function() {

    var self = this;

    if (self.state != 1000) return false;

    self.state = 2000; //multiline response

    self.sendCommand("LIST");
};

POP3Client.prototype.stat = function() {

    var self = this;

    if (self.state != 1000) return false;

    self.sendCommand("STAT");
};

POP3Client.prototype.quit = function() {

    var self = this;

    self.sendCommand("QUIT");
};
