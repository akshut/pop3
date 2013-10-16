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
    self.multi = false;

    self.buffer = "";
    self.newCommand = true;
}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.patterns = {
    timeStamp: /\<.+\@.+\>/
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

    self.socket.on('data', self.handler.bind(self, 'data'));
    self.socket.on('connect', self.handler.bind(self, 'connect'));
    self.socket.on('end', self.handler.bind(self, 'end'));
    self.socket.on('error', self.handler.bind(self, 'error'));
    self.socket.on('close', self.handler.bind(self, 'close'));

    self.state = 0; // initial, pre authorization, waiting for greeting
    self.buffer = "";
    self.hasQuit = false;

    if (self.runSynchronized) {
        var fn = self.fnYield;
        return fn();
    }
    return false;
};

POP3Client.prototype.synchronize = function(fnRun, fnYield) {
    var self = this;
    self.runSynchronized = true;
    self.fnRun = fnRun;
    self.fnYield = fnYield;
}

POP3Client.prototype.handler = function(type) {
    var self = this;
    var fail, greeting, timestamp, match, errorCode, arg1, error, data;

    switch (type) {
        case 'connect':
            //self.connected = true;
            break;
        case 'end':
            break;
        case 'error':
            break;
        case 'close':
           break;
        case 'data':
            data = arguments[1];
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
                    if (self.buffer.substr(0, 3).toUpperCase() === '+OK') {
                        success = true;
                    } else if (self.buffer.substr(0, 3).toUpperCase() === '-ERR')
                        success = false;
                    else {
                        reply = false;
                        errorCode = 2; // 1 is socket error
                        errorMessage = self.buffer.substr(0, idx);
                    }

                    self.newCommand = false;
                    self.commandResponse = self.buffer.substr(0, idx);
                    self.commandResponseParams = self.commandResponse.split(' ');
                    self.buffer = self.buffer.substr(idx + 2);
                    if (success) {
                        if (self.state === 0) { // extract timestamp for apop
                            self.useApop = false;
                            self.apopTimeStamp = null;
                            self.state = 100; // authorize state
                            self.connected = true;
                            //detect apop timestamp
                            if (match = self.patterns.timeStamp.exec(self.commandResponse)) {
                                self.apopTimeStamp = match[1];
                                self.useApop = true;
                            }
                            //self.emit('connection', true, greeting); //TODO: report port and security settings that succeeded
                        } else if (self.state === 200) {
                            self.state = 1000; // transact state
                        } else if (self.state === 3000) {
                            self.state = 10000; // update state
                        }
                    }
                    if (self.multi && !success && !errorCode) self.multi = false;
                }
            }
            if (reply && !errorCode && !self.multi && !self.newCommand && self.buffer.length ===0) {
                var result = {
                    status : success, 
                    response: self.commandResponseParams, 
                    data: self.commandResponseData
                };
                if (self.runSynchronized) {
                    var fn = self.fnRun;
                    fn(result);
                }
                reply = false;
            }
            if (reply && self.multi && (self.sendLine || self.sendChunk)) {
                self.emit('reply-begin', !success, self.commandResponseParams);
                reply = false;
            }
            reply = false;
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
                    var chunk = self.buffer;
                    if ((self.chunkNo === 1 && (self.buffer.substr(0, 3) === ".\r\n")) ||
                        (self.buffer.substr(self.buffer.length - 5) === "\r\n.\r\n")) {
                        self.endOfResponse = true;
                        chunk = self.buffer.substr(0, self.buffer.length - 3);
                    }
                    // replace dot from bol
                    if (self.chunkNo === 1) {
                        if (chunk.substr(0, 2) == '..') chunk = chunk.substr(1); // strip escape dot from first line
                    }
                    chunk = chunk.replace(/\r\n\.\./g, '\r\n\.'); // strip escape dot everywhere else

                    if (self.sendChunked) {
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
                self.emit('protocol-error', errorCode, errorMessage);
                var result = {
                    status : false, 
                    response: errorCode, 
                    data: errorMessage
                };
                if (self.runSynchronized) {
                    var fn = self.fnRun;
                    fn(result);
                }
                errorCode = 0;
                buffer = '';
            } else if (reply) {
                //self.emit('reply', success, self.commandResponseParams, self.commandResponseData);
                self.multi = false;
                var result = {
                    status : success, 
                    response: self.commandResponse, 
                    data: self.commandResponseData
                };
                if (self.runSynchronized) {
                    var fn = self.fnRun;
                    fn(result);
                }
            }
            break;
    }
};

POP3Client.prototype.sendCommand = function(verb, param) {

    var self = this;

    self.buffer = "";
    self.newCommand = true;
    self.endOfResponse = false;
    self.commandResponse = '';
    self.commandResponseParams = {};
    self.commandResponseData = '';

    var command = verb + (param ? ' ' + param : '') + '\r\n';

    self.socket.write(command);
    
    if (self.runSynchronized) {
        var fn = self.fnYield;
        return fn();
    }
}

POP3Client.prototype.user = function(username) {

    var self = this;

    if (self.state !== 100) return false;

    return self.sendCommand("USER", username);
};

POP3Client.prototype.pass = function(password) {

    var self = this;

    if (self.state !== 100) return false;

    self.state = 200;

    return self.sendCommand("PASS", password);
};

POP3Client.prototype.stat = function() {

    var self = this;

    if (self.state !== 1000) return false;

    return self.sendCommand("STAT");
};

POP3Client.prototype.list = function(msgNo) {

    var self = this;

    if (self.state !== 1000) return false;

    if (!msgNo) self.multi = true; //multiline response

    var command = "LIST" + (msgNo ? ' ' + msgNo : '');

    return self.sendCommand(command);
};

POP3Client.prototype.retr = function(msgNo) {

    var self = this;

    if (self.state !== 1000) return false;
    self.multi = true;

    return self.sendCommand("RETR " + msgNo);
};

POP3Client.prototype.noop = function() {

    var self = this;

    if (self.state !== 1000) return false;

    return self.sendCommand("NOOP");
};

POP3Client.prototype.rset = function() {

    var self = this;

    if (self.state !== 1000) return false;

    return self.sendCommand("RSET");
};

POP3Client.prototype.dele = function(msgNo) {

    var self = this;

    if (self.state !== 1000) return false;

    return self.sendCommand("DELE " + msgNo);
};

POP3Client.prototype.quit = function() {

    var self = this;

    if (self.state === 1000) self.state = 3000;
    return self.sendCommand("QUIT");
};

POP3Client.prototype.top = function(msgNo, lines) {

    var self = this;

    if (self.state !== 1000) return false;
    self.multi = true;

    return self.sendCommand("TOP " + msgNo, +' ' + lines);
};

POP3Client.prototype.uidl = function(msgNo) {

    var self = this;

    if (self.state !== 1000) return false;

    if (!msgNo) self.multi = true; //multiline response

    return self.sendCommand("UIDL" + (msgNo ? ' ' + msgNo : ''));
};

POP3Client.prototype.apop = function(name, secret) {

    var self = this;

    if (self.state !== 100) return false;
    self.state = 200;

    if (!self.useApop) return false;

    return self.sendCommand("APOP " + name, +' ' + crypto.createHash("md5").update(self.apopTimeStamp + secret).digest("hex"));
};
