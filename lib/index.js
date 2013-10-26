/*

Node POP3

*/

var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    net = require('net'),
    tls = require('tls');

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
    self.endOfResponse = true;

    this.fnRun = function(result) { 'pop3', self.emit(result); };
    this.fnYield = function() {};
}

util.inherits(POP3Client, EventEmitter);

module.exports['Client'] = function(params) {
    return new POP3Client(params);
};

POP3Client.prototype.patterns = {
    timeStamp: /\<.+\@.+\>/
};

POP3Client.prototype.connect = function(host, secure, port) {

    var self = this;
    var handle = self.handler.bind(self);

    if (!secure) secure = false;
    if (!port) port = secure ? 995 : 110;

    if (secure) {
        self.socket = tls.connect(port, host);
    }
    else self.socket = new net.connect({
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

    var yield = self.fnYield;
    if (yield) return yield();

    return false;
};

POP3Client.prototype.setCallback = function(callback) {
    var self = this;
    self.fnYield = null;
    if (typeof yield === 'function') self.fnRun = callback; 
    else {
        self.fnRun = null;
        return false;
    }
    return true;
}

POP3Client.prototype.synchronize = function(fnRun, fnYield) {
    var self = this;
    if ((typeof fnRun === 'function') && (typeof fnYield === 'function') ) {
        self.fnRun = fnRun;
        self.fnYield = fnYield;
        return true;
    }
    return false;
}

POP3Client.prototype.handler = function(type) {
    var self = this;
    var fail, greeting, timestamp, match, errorCode, arg1, error, data, fnRun, result;

    switch (type) {
        case 'connect':
            break;
        case 'end':
            break;
        case 'error':
            fnRun = self.fnRun;
            result = {
                status : false, 
                response: arguments[1], 
                data: null,
                error: true
            };
            fnRun(result);
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
                    } else if (self.buffer.substr(0, 4).toUpperCase() === '-ERR')
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
                self.endOfResponse = true;
                result = {
                    status : success, 
                    response: self.commandResponse, 
                    data: self.commandResponseParams
                };
                fnRun = self.fnRun;
                fnRun(result);
                reply = false;
            }
            if (reply && self.multi && (self.sendLine || self.sendChunk)) {
                //self.emit('reply-begin', !success, self.commandResponseParams);
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
                                self.multi = false;
                                //self.emit('reply-end');
                            }
                        } else {
                            if (line.substr(0, 2) == '..')
                                line = line.substr(1);
                            //self.emit('data-line', line);
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
                        //self.emit('data-chunk', chunk);
                        self.buffer = "";
                        if (self.endOfResponse) {
                            self.multi = false;
                            //self.emit('reply-end');
                        }
                    } else if (self.endOfResponse) {
                        self.commandResponseData = chunk;
                        self.buffer = "";
                        self.multi = false;
                        success = true;
                        reply = true;
                    }
                }
            }
            if (errorCode) {
                result = {
                    status : false, 
                    response: errorCode, 
                    data: errorMessage,
                    error : true
                };
                fnRun = self.fnRun;
                fnRun(result);
                errorCode = 0;
                buffer = '';
            } else if (reply) {
                self.multi = false;
                result = {
                    status : success, 
                    response: self.commandResponse, 
                    data: self.commandResponseData,
                    parsedResult: self.commandResponseData
                };
                fnRun = self.fnRun;
                fnRun(result);
            }
            break;
    }
};

POP3Client.prototype.beginCommand = function(states, multi, newState) {
    var self = this;
    if (!self.endOfResponse) return false;

    if (states && states !== '*') {
        if (!(states instanceof Array)) {
            states = [states];
        }
        if (states.indexOf(self.state) === -1) return false;
    }

    if (newState) {
        if (typeof newState !== 'number') return false;
        self.state = newState;
    }

    self.multi = multi ? true : false;
    self.buffer = "";
    self.errorCode = 0;
    self.commandResponse = '';
    self.commandResponseParams = {};
    self.commandResponseData = '';
    
    return true;
}

POP3Client.prototype.sendCommand = function(verb, param) {

    var self = this;

    self.newCommand = true;
    self.endOfResponse = false;

    var command = verb + (param ? ' ' + param : '') + '\r\n';

    self.socket.write(command);
    
    var fn = self.fnYield;
    return fn();
}

POP3Client.prototype.invalidState = function() {
    var result = {
        status : false, 
        response: 'This command cannot be issued in this state',
        data: 'This command cannot be issued in this state',
        error : true
    };
    return result;
}

POP3Client.prototype.user = function(username) {

    var self = this;

    if (!self.beginCommand(100)) return self.invalidState();


    return self.sendCommand("USER", username);
};

POP3Client.prototype.pass = function(password) {

    var self = this;

    if (!self.beginCommand(100)) return self.invalidState();

    self.state = 200;

    return self.sendCommand("PASS", password);
};

POP3Client.prototype.stat = function() {

    var self = this;

    if (!self.beginCommand(1000)) return self.invalidState();

    return self.sendCommand("STAT");
};

POP3Client.prototype.list = function(msgNo) {

    var self = this;

    var multi = !msgNo;

    if (!self.beginCommand(1000, multi)) return self.invalidState();

    var command = "LIST" + (!multi ? ' ' + msgNo : '');

    var result = self.sendCommand(command);

    if (multi && result.status) { // successful
        // split result

        var lines = result.data.split('\r\n');
        for (var i=0; i<lines.length; i++) {
            lines[i] = lines[i].split(' ');
        }
        lines.pop(); // discard final crlf
        result.parsedResult = lines;
    }
    return result;
};

POP3Client.prototype.retr = function(msgNo) {

    var self = this;

    if (!msgNo) return false;

    if (!self.beginCommand(1000, true)) return self.invalidState();

    return self.sendCommand("RETR " + msgNo);
};

POP3Client.prototype.noop = function() {

    var self = this;

    if (!self.beginCommand(1000)) return self.invalidState();

    return self.sendCommand("NOOP");
};

POP3Client.prototype.rset = function() {

    var self = this;

    if (!self.beginCommand(1000)) return self.invalidState();

    return self.sendCommand("RSET");
};

POP3Client.prototype.dele = function(msgNo) {

    var self = this;

    if (!self.beginCommand(1000)) return self.invalidState();

    return self.sendCommand("DELE " + msgNo);
};

POP3Client.prototype.quit = function() {

    var self = this;

    if (!self.beginCommand([100, 1000], false, self.state===1000?3000:self.state)) return self.invalidState();

    return self.sendCommand("QUIT");
};

POP3Client.prototype.top = function(msgNo, lines) {

    var self = this;

    if (!self.beginCommand(1000, true)) return self.invalidState();

    return self.sendCommand("TOP " + msgNo, +' ' + lines);
};

POP3Client.prototype.uidl = function(msgNo) {

    var self = this;

    var multi = !msgNo;

    if (!self.beginCommand(1000, multi)) return self.invalidState();

    var command = "UIDL" + (!multi ? ' ' + msgNo : '');
    var result = self.sendCommand(command);

    if (multi && result.status) { // successful
        // split result

        var lines = result.data.split('\r\n');
        for (var i=0; i<lines.length; i++) {
            lines[i] = lines[i].split(' ');
        }
        lines.pop(); // discard final crlf
        result.parsedResult = lines;
    }
    return result;
};

POP3Client.prototype.noPop3 = function() {
    var result = {
        status : false, 
        response: 'POP3 support was not detected on the server', 
        data: 'POP3 support was not detected on the server',
        error : true
    };
    return result;
}

POP3Client.prototype.apop = function(name, secret) {

    var self = this;

    if (!self.useApop) return self.noPop3();
    if (!self.beginCommand(100, false, 200)) return self.invalidState();


    return self.sendCommand("APOP " + name, +' ' + crypto.createHash("md5").update(self.apopTimeStamp + secret).digest("hex"));
};
