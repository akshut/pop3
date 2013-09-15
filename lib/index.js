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
}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.patterns = {
    timeStamp: /\<.+\@.+\>/;
};

POP3Client.prototype.connect = function(host, username, password, secure, port) {

    var self = this;
    var handle = self.handler.bind(self);

    if (!secure) secure = false;
    if (!port) port = secure ? 993 : 110;

    self.socket = new net.connect({
        host: host,
        port: port
    });
    self.socket.on('data', self.handler.bind(self, 'socket-data'));
    self.socket.on('connect', function() {
        handle('socket', 'connect');
    });
    self.socket.on('end', function() {
        handle('socket', 'end');
    });
    self.socket.on('error', function(err) {
        handle('socket', 'error', err);
    });
    self.socket.on('close', function(hadError) {
        handle('socket', 'close', hadError);
    });

    self.state = 0; // initial, pre authorization, waiting for greeting
    self.buffer = "";
    self.hasQuit = false;

    handle('begin');
    if (runSynchronized) {
        fnYield();
    }
};

POP3Client.prototype.synchronize() = function(fnRun, fnYield) {
    self.runSynchronized = true;
    self.fnRun = fnRun;
    self.fnYield = fnYield;
}

POP3Client.prototype.handler = function() {
    var self = this;
    var type = arguments[0];
    var fail, greeting, timestamp, match, errorCode, arg1, error, data;

    switch (type) {
        case 'socket':
            arg1 = arguments[1];
            switch (arg1) {
                case 'connect':
                    self.connected = true;
                    break;
                case 'end':
                    break;
                case 'error':
                    error = arguments[2];
                    if (!self.connected) {
                        // the socket did not connect, report
                        self.emit('connection', false, error)
                    } else {
                        self.emit('error', 'socket', error);
                    }
                    break;
                case 'close':
                    // clean up
                    if (!self.hasQuit) {
                        self.emit('close');
                    }
                    break;
            }
            break;
        case 'socket-data':
            arg1 = arguments[1];
            var dataChunk = data.toString("ascii");
            self.buffer += dataChunk;

            var match;

            var success = false;
            var errorCode = 0;
            var errorMessage = "Protocol error";
            var reply = false;
            var idx, pos;

            if (self.newCommand) {
                self.chunkNo = 0;
                idx = self.buffer.indexOf('\r\n');
                if (idx > 0) {
                    reply = true;
                    if (self.buffer.substr(0, 3).toUpperCase() === '+OK')
                        success = true;
                    else if (self.buffer.substr(0, 3).toUpperCase() === '-ERR')
                        success = false;
                    else {
                        reply = false;
                        errorCode = 2; // 1 is socket error
                    }

                    self.newCommand = false;
                    self.commandResponse = self.buffer.substr(0, idx);
                    self.commandResponseParams = self.commandResponse.split(' ');
                    self.buffer = self.buffer.substr(idx + 2);

                    if (self.multi && !success && !errorCode) self.multi = false;
                }
            }
            if (reply && self.multi && (self.sendLine || self.sendChunk)) {
                self.emit('reply-begin', !success, self.commandResponseParams);
                reply = false;
            }
            if (!errorCode && !self.newCommand && self.buffer.length > 0) {
                self.chunkNo++;
                if (!self.multi) {
                    errorCode = 3;
                } else if ((!self.endOfResponse) == false) {
                    errorCode = 4;
                } else if (self.sendLine) {
                    pos = 0;
                    do {
                        idx = self.buffer.indexOf('\r\n', pos);
                        if (idx < 0) break;
                        var line = self.buffer.substr(pos, idx - pos);
                        if (line === '.') {
                            // end of response
                            self.endOfResponse = true;
                            if (self.buffer.length > idx + 2) {
                                errorCode = 5;
                            } else {
                                self.emit('reply-end');
                            }
                        } else {
                            if (line.substr(0, 2) == '..')
                                line = line.substr(1);
                            self.emit('data-line', 'line', line);
                        }
                        pos = idx + 2;
                    } while (true);
                    self.buffer = self.buffer.substr(pos);
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
                        chunk = chunk.replace(/\r\n\.\./g, '\r\n\.'); // strip escape dot everywhere else
                    }
                    if (self.sendChunk) {
                        self.emit('data-chunk', 'chunk', chunk);
                        self.buffer = "";
                        if (self.endOfResponse) {
                            self.emit('reply-end');
                        }
                    } else if (self.endOfResponse) {
                        self.commandResponseData = chunk;
                        self.buffer = "";
                        reply = true;
                    }
                }
            }
            if (errorCode) {
                self.emit('error', errorCode, errorMessage);
                errorCode = 0;
                buffer = '';
            } else if (reply) {
                self.emit('reply', !success, self.commandResponseParams, self.commandResponseData);

                fail = !success;
                switch (self.state) {
                    case 0: // initial state
                        {
                            greeting = arguments[2];
                            self.apop = false;
                            self.apopTimeStamp = null;
                            if (!fail) {
                                self.state = 100; // connected state
                                self.connected = true;

                                //detect apop timestamp
                                if (match = self.patterns.timeStamp.exec(greeting)) {
                                    self.apopTimeStamp = match[1];
                                    self.apop = true;
                                }
                                self.emit('connection', true, greeting); //TODO: report port and security settings that succeeded
                            } else {
                                //close the connection
                                self.connected = false;
                                socket.close();
                                socket = null;
                                self.state = 0;
                                self.emit('connection', false, greeting);
                            }
                        }
                        break;
                    case 100: // connected state
                        {
                            if (!fail) {} else {}
                        }
                        break;
                    case 200: // connected state after pass, apop etc. success moves the connection to authorized, failure back to 100
                        {
                            if (!fail) {
                                self.state = 1000;
                                self.emit('authorization', false);
                            } else {
                                self.state = 100;
                                self.emit('authorization', false);
                            }
                        }
                        break;
                    case 1000: // transaction state, single line replies
                        {
                            if (!fail) {
                                self.emit('transaction', false);
                            } else {
                                self.state = 100;
                                self.emit('transaction', false);
                            }
                        }
                        break;
                    case 2000: // transaction state, multi line replies
                        {
                            self.state = 1000;
                            if (!fail) {
                                self.emit('transaction', false);
                            } else {
                                self.emit('transaction', false);
                            }
                        }
                        break;
                    case 3000: // transaction state, after quit issued
                        {
                            self.state = 10000;
                            if (!fail) {
                                self.emit('session', true);
                            } else {
                                self.emit('session', false);
                            }
                        }
                        break;
                }
            }
            break;
        case "data":
            break;
        case "data-line":
            break;
        case "data-chunk":
            break;
        case "error":
            break;
    }
}

POP3Client.prototype.onData = function(data) {
    var self = this;
    var handle = self.handler.bind(self);

    var dataChunk = data.toString("ascii");
    self.buffer += dataChunk;

    var match;

    var success = false;
    var errorCode = 0;
    var errorMessage = "Protocol error";
    var reply = false;
    var idx, pos;

    if (self.newCommand) {
        self.chunkNo = 0;
        idx = self.buffer.indexOf('\r\n');
        if (idx > 0) {
            reply = true;
            if (self.buffer.substr(0, 3).toUpperCase() === '+OK')
                success = true;
            else if (self.buffer.substr(0, 3).toUpperCase() === '-ERR')
                success = false;
            else {
                reply = false;
                errorCode = 2; // 1 is socket error
            }

            self.newCommand = false;
            self.commandResponse = self.buffer.substr(0, idx);
            self.commandResponseParams = self.commandResponse.split(' ');
            self.buffer = self.buffer.substr(idx + 2);

            handle('reply', !success, self.commandResponseParams);

            if (self.multi && !success && !errorCode) self.multi = false;
        }
    }

    if (errorCode) {} else if (!self.newCommand && self.buffer.length > 0) {
        self.chunkNo++;
        if (!self.multi) {
            errorCode = 3;
        } else if ((!self.endOfResponse) == false) {
            errorCode = 4;
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
                        errorCode = 5;
                    } else {
                        handle('data-line', 'end');
                        reply = true;
                    }
                } else {
                    if (line.substr(0, 2) == '..')
                        line = line.substr(1);
                    handle('data-line', 'line', line);
                }
                pos = idx + 2;
            } while (true);
            self.buffer = self.buffer.substr(pos);
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
                chunk = chunk.replace(/\r\n\.\./g, '\r\n\.'); // strip escape dot everywhere else
            }
            if (self.sendChunked) {
                handle('data-chunk', 'chunk', chunk);
                self.buffer = "";
                if (self.endOfResponse) {
                    handle('data-chunk', 'end');
                    reply = true;
                }
            } else if (self.endOfResponse) {
                handle('data', 'data', chunk);
                self.buffer = "";
                reply = true;
            }
        }
    }

    if (errorCode) {
        handle('error', errorCode, errorMessage);
        errorCode = 0;
        buffer = '';
    }
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

    if (self.state >= 1000) self.state = 3000;
    self.sendCommand("QUIT");
};
