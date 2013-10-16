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

	var connected = client.connect(host);
	if (!connected) console.log('could not connect');
	
	while (connected) {
		var command = read('command: ');
		if (!command || command === '' || typeof command !== 'string' ) break;

		var result = '';
		if (command.substr(0,5).toLowerCase() === 'user ') result = client.user(command.substr(5));
		else if (command.substr(0,5).toLowerCase() === 'pass ') result = client.pass(command.substr(5));
		else if (command.substr(0,4).toLowerCase() === 'list') result = client.list(command.substr(4));
		else if (command.substr(0,5).toLowerCase() === 'retr ') result = client.retr(command.substr(5));
		else if (command.substr(0,4).toLowerCase() === 'stat') result = client.stat(command.substr(4));
		else if (command.substr(0,4).toLowerCase() === 'noop') result = client.noop(command.substr(4));
		else if (command.substr(0,4).toLowerCase() === 'rset') result = client.rset(command.substr(4));
		else if (command.substr(0,5).toLowerCase() === 'dele ') result = client.dele(command.substr(5));
		else if (command.substr(0,4).toLowerCase() === 'quit') result = client.quit(command.substr(4));
		else if (command.substr(0,4).toLowerCase() === 'top ') result = client.top(command.substr(4));
		else if (command.substr(0,4).toLowerCase() === 'uidl') result = client.uidl(command.substr(4));
		else if (command.substr(0,5).toLowerCase() === 'apop') result = client.apop(command.substr(4));

		if (result) {
			console.log(result);
			if (result.data) console.log(result.data);
		}
	}
}

Fiber(function() { work(); }).run();

