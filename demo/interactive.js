var assert = require('assert');
var util = require('util');
var Fiber = require('fibers');
var pop3 = require("../lib/index.js");
var readline = require('readline');

var fiber;

function read(prompt) {

	fiber = Fiber.current;
	
	var rl = readline.createInterface({
	  input: process.stdin,
	  output: process.stdout
	});

	rl.question(prompt, function(input) {
	  rl.close();
	  fiber.run(input);
	});
	return Fiber.yield();
}

function work() {
	
	fiber = Fiber.current;
	
	var client = pop3.Client({});

	client.synchronize(fiber.run.bind(fiber), Fiber.yield.bind(Fiber));

	var host = read('host: ');
	if (host === '') return;

	var connected = client.connect(host, true);
	if (connected.error) {
		console.log('could not connect to host: ' + host);
		return;
	}
	else console.log(connected.response);
	
	while (true) {
		var command = read('command: ');
		if (typeof command !== 'string' || command === '') break;
		
		var args = undefined;
		var verb = command.trim();
		var idx = verb.indexOf(' ');
		if ( idx > 0) {
			verb = command.substr(0, idx);
			args = command.substr(idx+1).trim();
			if (args === '') args = undefined;
		}

		var result;
		if (verb === 'show') console.log(client);
		else {
			result = args? client[verb.toLowerCase()](args) : client[verb.toLowerCase()]();
			if (result.parsedResult) console.log(result.parsedResult);
			else if (result.response) console.log(result.response);
			else console.log(result);
		}
	}
}

Fiber(function() { work(); }).run();

