##pop3
=============

pop3 is a Nodejs library implementing the POP3 protocol. The client library implements RFC 1939 and TLS support.

## Demo

A demo is available under the demo folder.  An interactive demo is available at demo/interactive.js. This illustrates how this library can be used to run synchronously. A sample session is as follows:

`host: pop.mail.yahoo.com
+OK hello from popgate-0.8.0.504347 pop108.mail.gq1.yahoo.com
command: user USERNAME
+OK password required.
command: pass PASSWORD
+OK maildrop ready, 4077 messages (875008486 octets) (1634370939)
command: stat
+OK 4077 875008486
command: list 1
+OK 1 2519
command: uidl 10
+OK 10 7986d57effb584a2cc3329bda1e0d11e
command: quit
+OK server signing off.
command:
`
To run the basic demo edit the demo/basic.js to replace HOST, USERNAME and PASSWORD with your mailbox settings. If you need async operation use the setCallback method instead of synchronize.

## API

`connect (host, secure, port)`

Creates a socket connection to the host and port. If secure is true, TLS is used. Returns (or calls back) when the greeting is received from the server. If successful, the connection enters the autorize state.

`user (username)`

Issues the USER pop3 command.

`pass (password)`

Issues the PASS pop3 command. If successful, the connection enters the transaction state.

`apop (username, password)`
Issues the APOP pop3 command. If successful, the connection enters the transaction state.

`stat ()`

Issues the `STAT` command.

`list ([msgNo])`

Issues the `LIST` pop3 command. If the optional `msgNo` is provided, then `LIST msgNo` is issued. Otherwise the multi-line reply is parsed into an array. 

`retr (msgNo)`

Issues the `RETR msgNo` pop3 command.

`noop ()`

Issues the `NOOP` pop3 command.

`rset ()`

Issues the `RSET` pop3 command.

`dele (msgNo)`

Issues the `DELE msgNo` pop3 command.

`quit ()`

Issues the `QUIT` pop3 command.

`top (msgNo, lines)`

Issues the `TOP msgNo lines` pop3 command.

`uidl ([msgNo])`

Issues the `UIDL` command. If the optional `msgNo` is provided, then `UIDL msgNo` is issued. Otherwise the multi-line reply is parsed into an array.

