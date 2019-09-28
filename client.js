const net = require('net');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:client');
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');
const readline = require('readline');
const utils = require('./utils.js');

const resolveData = ({data:{response}}) => {
    return Promise.resolve(response);
};

var zip = (a,b) => a.map((x,i) => [x,b[i]]);

const State = {
    CONNECTING: "connecting",
    CONNECTED: "connected",
    WHO_START: "who_start",
    WHO_IN: "who_in",
    WHO_DB: "who_db"
};

class Client extends EventEmitter {
    constructor(config, userCfg, dedup, isMain) {
        super();
        this.config = config;
        this.userCfg = userCfg
        this.dedup = dedup;
        this.isMain = isMain;
        this.socket = null;
        this.state = State.CONNECTING;
        this.players = {};
        this.players_ordered = [];
        this.my_dbnum = null;
        this.connect_rx = RegExp(".*connects you to an existing character\\..*");
        this.who_start_rx = RegExp("^Player Name.*");
        this.who_stop_rx = RegExp("^\\d+ Players logged in,.*");
        this.who_db_rx = /^--__LWHO__-- (.*)$/;
        this.person_speaks_rx = /^\[([\w ]+)\(#(\d+)\),saypose\] (.*) says, \"(.*)\"$/;
        this.person_poses_rx = /^\[([\w ]+)\(#(\d+)\),saypose\] (.*)$/;
        this.person_action_rx = /^\[([\w ]+)\(#(\d+)\)\] (.*)$/;
    }
    connect() {
        debugVerbose("Connecting...");

        this.socket = new net.Socket();
        this.rl = readline.createInterface({input: this.socket});

        this.rl.on('line', (line) => {
            console.log(`Line from MUD: ${line}`);

            /// State: CONNECTING
            if (this.state == State.CONNECTING && this.connect_rx.test(line)) {
                this.socket.write("connect " + this.userCfg.mud.username + " " +
                                  this.userCfg.mud.password + "\n");
                this.sendPlayerSetup();
                this.sendWHO();
                return;
            }
            /// State: WHO_START
            if (this.state == State.WHO_START && this.who_start_rx.test(line)) {
                this.state = State.WHO_IN;
                return;
            }
            /// State: WHO_IN
            if (this.state == State.WHO_IN) {
                if (this.who_stop_rx.test(line)) {
                    this.state = State.WHO_DB;
                    this.socket.write("@pemit me=--__LWHO__-- [lwho()]\n");
                    return;
                }
                var name = line.split(" ")[0];
                if (!this.players.hasOwnProperty(name)) {
                    console.log(`Adding person: ${name}`);
                    this.players[name] = {};
                    this.players_ordered.push(name);
                }
                return;
            }
            /// State: WHO_DB
            if (this.state == State.WHO_DB) {
                if (this.who_db_rx.test(line)) {
                    let matches = Array.from(line.match(this.who_db_rx));
                    let dbnums = Array.from(matches[1].split(" "));
                    for (let [name, dbnum] of zip(this.players_ordered, dbnums)) {
                        this.players[name].dbnum = dbnum;
                        if (name == this.userCfg.mud.username) {
                            this.my_dbnum = dbnum;
                        }
                    }
                    this.state = State.CONNECTED;
                    console.log("Done with WHO. Players are:", this.players);
                    this.sendMatrixNotice(`Connected to ${this.config.mud.name}`);
                    return;
                }
                console.log(`Skipping this line in WHO_DB state: ${line}`);
                return;
            }
            /// State: CONNECTED
            if (this.state == State.CONNECTED) {
                /// Action: self say
                if (line.startsWith("You say, ")) {
                    console.log("Skipping my own line");
                    return;
                }
                /// Action: <person> say
                if (this.person_speaks_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_speaks_rx));
                    console.log(`SAY SAY SAY: ${matches}`);
                    let mud_user = matches[1];
                    if (this.players.hasOwnProperty(mud_user))
                        this.sendMatrixMessage(matches[4], null, "m.text", null,
                                               mud_user);
                    else
                        this.sendMatrixBlock(line);
                    return;
                }
                /// Action: <person> pose
                if (this.person_poses_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_poses_rx));
                    console.log(`POSE POSE POSE: ${matches}`);
                    let mud_user = matches[1];
                    if (this.players.hasOwnProperty(mud_user))
                        this.sendMatrixMessage(matches[3], null, "m.emote", null,
                                               mud_user);
                    else
                        this.sendMatrixBlock(line);
                    return;
                }
                /// Action: General person's action
                if (this.person_action_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_action_rx));
                    console.log(`ACTION ACTION ACTION: ${matches}`);
                    let mud_user = matches[1];
                    let body = matches[3];
                    if (body.startsWith(mud_user)) {
                        body = body.slice(mud_user.length);
                        if (body.startsWith(" "))
                            body = body.slice(1);
                    }
                    if (this.players.hasOwnProperty(mud_user))
                        this.sendMatrixMessage(body, null, "m.emote", null,
                                               mud_user);
                    else
                        this.sendMatrixBlock(line);
                    return;
                }

                this.sendMatrixBlock(line);
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

    sendMatrixMessage(body, html=undefined, msgtype="m.text", convo=undefined,
                      mud_user=undefined, self_id=undefined) {
        convo = convo || this.config.mud.name;
        mud_user = mud_user || this.config.mud.name;
        self_id = self_id || this.config.users.bobbit.id;

        if (!this.isMain && mud_user != this.userCfg.mud.username) {
            console.log(`Skipping line from other user=${mud_user}: ${body}`);
            return;
        }

        this.emit("message", {
            roomId: convo,
            senderName: mud_user,
            senderId: mud_user == self_id ? undefined : mud_user,
            avatarUrl: null,
            text: body,
            html: html,
            msgtype: msgtype,
            conversation_id: convo,
            conversation_name: convo
        });
    }

    sendMatrixNotice(body) {
        this.sendMatrixMessage(body, `<h1>${body}</h1>`, "m.notice");
    }

    sendMatrixBlock(body, msgtype="m.text") {
        this.sendMatrixMessage(body, `<pre><code>${body}</code></pre>`,
                               msgtype);
    }

    sendPlayerSetup() {
        this.socket.write("@set me=nospoof\n");
    }

    sendWHO() {
        // TODO: consider current state before moving to WHO_START
        console.log("Starting WHO");
        this.state = State.WHO_START;
        this.socket.write("WHO\n");
    }

    send(id, msg) {
        if (msg.endsWith(this.dedup))
            msg = msg.slice(0, msg.length - 2);
        this.socket.write('"' + msg + "\n");
        return Promise.resolve();
    }

    sendEmote(id, msg) {
        if (msg.endsWith(this.dedup))
            msg = msg.slice(0, msg.length - 2);
        this.socket.write(':' + msg + "\n");
        return Promise.resolve();
    }
}

module.exports = Client;
