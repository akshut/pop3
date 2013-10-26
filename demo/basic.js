var assert = require('assert');
var util = require('util');
var Fiber = require('fibers');
var pop3 = require("../lib/index.js");

var client = pop3.Client({});

var fiber;
function work() {
	fiber = Fiber.current;

	client.synchronize(fiber.run.bind(fiber), Fiber.yield.bind(Fiber));
	
	console.log('connect: ', client.connect(HOST));

	console.log('user: ' , client.user(USERNAME));

	console.log('pass: ' , client.pass(PASSWORD));

	console.log('list: ' , client.list());

	console.log('quit: ' , client.quit());
	
}

Fiber(function() { work(); }).run();

