const net = require('net');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:client');
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');
const readline = require('readline');

const resolveData = ({data:{response}}) => {
    return Promise.resolve(response);
};

const State = {
    CONNECTING: "connecting",
    CONNECTED: "connected",
    WHO_START: "who_start",
    WHO_IN: "who_in"
};

class Client extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.socket = null;
        this.state = State.CONNECTING;
        this.players = {};
        this.connect_rx = RegExp(".*connects you to an existing character\\..*");
        this.who_start_rx = RegExp("^Player Name.*");
        this.who_stop_rx = RegExp("^\\d+ Players logged in,.*");
        this.person_speaks_rx = /^(.*) says, \"(.*)\"$/;
    }
    connect() {
        debugVerbose("Connecting...");

        this.socket = new net.Socket();
        this.rl = readline.createInterface({input: this.socket});

        this.rl.on('line', (line) => {
            console.log(`Line from MUD: ${line}`);

            if (this.state == State.CONNECTING && this.connect_rx.test(line)) {
                this.socket.write("connect " + this.config.mud.username + " " +
                                  this.config.mud.password + "\n");
                this.sendPlayerSetup();
                this.sendWHO();
                return;
            }
            if (this.state == State.WHO_START && this.who_start_rx.test(line)) {
                this.state = State.WHO_IN;
                return;
            }
            if (this.state == State.WHO_IN) {
                if (this.who_stop_rx.test(line)) {
                    console.log("Done with WHO. Players are:", this.players);
                    this.state = State.CONNECTED;
                    return;
                }
                var name = line.split(" ")[0];
                if (this.players.name == undefined) {
                    console.log(`Adding person: ${name}`);
                    this.players[name] = {};
                }
            }
            if (this.state == State.CONNECTED) {
                if (line.startsWith("You say, ")) {
                    console.log("Skipping my own line");
                    return;
                }
                if (this.person_speaks_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_speaks_rx));
                    console.log(matches);
                    let msg = {
                        'status': 'success',
                        'type': 'message',
                        'content': matches[2],
                        'attachments': null,
                        'conversation_id': this.config.mud.name,
                        'conversation_name': this.config.mud.name,
                        'photo_url': null,
                        'user': matches[1],
                        'self_user_id': matches[1],
                        'user_id': {'chat_id': matches[1]}
                    };
                    console.log("Sending message:", msg);
                    this.emit("message", msg);
                }
            }
        });

        this.socket.on("close", () => {
            debugVerbose("Connection to MUD closed");
            this.emit("status", "Connection to MUD closed");
            this.socket = null;
            // await sleep(2000);
            // this.connect()
        });

        this.socket.connect(this.config.mud.port, this.config.mud.host);

        debugVerbose('Connected to:', this.config.mud.host);
    }

    sendPlayerSetup() {
        // this.socket.write("set me=nospoof\n");
    }

    sendWHO() {
        // TODO: consider current state before moving to WHO_START
        console.log("Starting WHO");
        this.state = State.WHO_START;
        this.socket.write("WHO\n");
    }

    send(id, msg) {
        debugVerbose("client.send:", ie, msg);
        let themsg = { 'cmd': "sendmessage", 'conversation_id':id,
                       'msgbody': msg };
        debugVerbose('sending message to MUD', JSON.stringify(themsg));
        this.socket.write(JSON.stringify(themsg) + "\n");
        return Promise.resolve();
    }
}

module.exports = Client;
