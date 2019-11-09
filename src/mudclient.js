const net = require('net');
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:client');
const EventEmitter = require('events').EventEmitter;
const Promise = require('bluebird');
const readline = require('readline');
const utils = require('./mudutils.js');

const resolveData = ({data:{response}}) => {
    return Promise.resolve(response);
};

const State = {
    CONNECTING: "connecting",
    CONNECTED: "connected",
    LOGGED_IN: "logged_in"
};

class MUDClient extends EventEmitter {
    constructor(controller, mudCfg, userCfg, dedup, isMain) {
        super();
        this.controller = controller;
        this.mudCfg = mudCfg;
        this.userCfg = userCfg
        this.dedup = dedup;
        this.isMain = isMain;
        this.muduser = this.userCfg.username;
        this.socket = null;
        this.state = State.CONNECTING;
        this.my_dbnum = null;
        this.connect_rx = /.*connects you to an existing character\./;
        this.logged_in_rx = /^--__--LOGGED_IN--__--$/;
        this.person_speaks_rx = /^\[([\w ]+)\(#(\d+)\),saypose\] (.*) says, \"(.*)\"$/;
        this.person_poses_apo_rx = /^\[([\w ]+)\(#(\d+)\),saypose\] \w+('s .*)$/;
        this.person_poses_rx = /^\[([\w ]+)\(#(\d+)\),saypose\] (.*)$/;
        this.person_action_rx = /^\[([\w ]+)\(#(\d+)\)\] (.*)$/;
        this.person_forced_speaks_rx = /^\[([\w ]+)\(#(\d+)\)<-([\w ]+)\(#(\d+)\),saypose\] (.*) says, \"(.*)\"$/;
        this.person_forced_poses_rx = /^\[([\w ]+)\(#(\d+)\)<-([\w ]+)\(#(\d+)\),saypose\] (.*)$/;
        this.person_triggered_speaks_rx = /^\[([\w ]+)\(#(\d+)\)\{[\w ]+\}\] (.*) says, \"(.*)\"$/;
        this.person_triggered_poses_rx = /^\[([\w ]+)\(#(\d+)\)\{[\w ]+\}\] ([\w ]+) (.*)$/;
        this.default_nospoof_rx = /^\[[^\]]\] (.*)$/;
    }

    connect() {
        debugVerbose("Connecting...");

        this.socket = new net.Socket();
        this.rl = readline.createInterface({input: this.socket});

        this.rl.on('line', (line) => {
            console.log(`Line from MUD: ${line}`);

            /// State: CONNECTING
            if (this.state == State.CONNECTING && this.connect_rx.test(line))
            {
                console.log("Logging in...");
                this.socket.write("connect " + this.muduser + " " +
                                  this.userCfg.password + "\n");
                this.state = State.CONNECTED;
                this.sendPlayerSetup();
                return;
            }
            // State: CONNECTED
            else if (this.state == State.CONNECTED && this.logged_in_rx.test(line))
            {
                console.log("Logged in.");
                this.state = State.LOGGED_IN;
            }
            // State: LOGGED_IN
            else if (this.state == State.LOGGED_IN) {
                /// Action: self say
                if (line.startsWith("You say, ")) {
                    console.log("Skipping my own line");
                    return;
                }
                /// Action: [person(#3)<-(#15),saypose] <person> says
                if (this.person_forced_speaks_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_forced_speaks_rx));
                    console.log(`FORCED SAY: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[6];
                    this.sendMatrixMessage({
                        body:body, line:line, mud_user:mud_user,
                        mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action: [person(#3)<-(#15),saypose] <person> poses
                else if (this.person_forced_poses_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_forced_poses_rx));
                    console.log(`FORCED SAY: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[5];
                    this.sendMatrixMessage({
                        body:body, line:line, mud_user:mud_user,
                        mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action, trigger: [person(#3){person}] <person> says
                else if (this.person_triggered_speaks_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_triggered_speaks_rx));
                    console.log(`TRIGGERED SAY: ${matches}`);
                    let mud_user = matches[3];
                    let body = matches[4];
                    this.sendMatrixMessage({body:body, line:line,
                                            mud_user:mud_user});
                    return;
                }
                /// Action, trigger: [person(#3){person}] <person> poses
                else if (this.person_triggered_poses_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_triggered_poses_rx));
                    console.log(`TRIGGERED POSE: ${matches}`);
                    let mud_user = matches[4];
                    let body = matches[5];
                    this.sendMatrixMessage({
                        body:body, line:line, msgtype:"m.emote",
                        mud_user:mud_user});
                    return;
                }
                /// Action: <person> say
                else if (this.person_speaks_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_speaks_rx));
                    console.log(`SAY SAY SAY: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[4];
                    this.sendMatrixMessage({
                        body:body, line:line,
                        mud_user:mud_user, mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action: <person>'s pose
                else if (this.person_poses_apo_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_poses_apo_rx));
                    console.log(`POSE's POSE's POSE's: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[3];
                    let short = matches[3];
                    if (short.startsWith(mud_user)) {
                        short = short.slice(mud_user.length);
                        if (short.startsWith(" "))
                            short = short.slice(1);
                    }
                    this.sendMatrixMessage({
                        body:short, line:body, msgtype:"m.emote",
                        mud_user:mud_user, mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action: <person> pose
                else if (this.person_poses_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_poses_rx));
                    console.log(`POSE POSE POSE: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[3];
                    let short = matches[3];
                    if (short.startsWith(mud_user)) {
                        short = short.slice(mud_user.length);
                        if (short.startsWith(" "))
                            short = short.slice(1);
                    }
                    this.sendMatrixMessage({
                        body:short, line:body, msgtype:"m.emote",
                        mud_user:mud_user, mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action: General person's action
                else if (this.person_action_rx.test(line)) {
                    let matches = Array.from(line.match(this.person_action_rx));
                    console.log(`ACTION ACTION ACTION: ${matches}`);
                    let mud_user = matches[1];
                    let mud_dbnum = matches[2];
                    let body = matches[3];
                    let short = matches[3];
                    if (short.startsWith(mud_user)) {
                        short = short.slice(mud_user.length);
                        if (short.startsWith(" "))
                            short = short.slice(1);
                    }
                    this.sendMatrixMessage({
                        body:short, line:body, msgtype:"m.emote",
                        mud_user:mud_user, mud_dbnum:mud_dbnum});
                    return;
                }
                /// Action: self speaking/posing, no @nospoof prefix
                else if (line.startsWith(this.muduser))
                {
                    console.log(`Skipping self pose: ${line}`);
                    return;
                }

                console.log(`DEFAULT DEFAULT DEFAULT`);
                if (this.default_nospoof_rx.test(line))
                {
                    let matches = Array.from(line.match(this.default_nospoof_rx));
                    this.sendMatrixBlock(matches[1]);
                }
                else
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

        this.socket.connect(this.mudCfg.port, this.mudCfg.host);

        debugVerbose('Connected to:', this.mudCfg.host);
    }

    sendMatrixMessage({body=null, html=undefined, line=null, msgtype="m.text",
                       mud_user=null, mud_dbnum=null} = {})
    {
        return this._sendMatrixMessage(utils.escapeMsgBody(body), html, line,
                                       msgtype, mud_user, mud_dbnum);
    }

    _sendMatrixMessage(body, html, line, msgtype, mud_user, mud_dbnum)
    {
        console.log(`_sendMatrixMessage(${body}, ${html}, ${line}, ${msgtype}, ${mud_user}, ${mud_dbnum})`);
        console.log(this.controller.cliByDbNum);
        mud_user = mud_user || this.muduser;

        if (!this.isMain && mud_user != this.muduser)
        {
            console.log(`Skipping line from other user=${mud_user}: ${body}`);
            return;
        }
        else if (this.isMain)
        {
            if (mud_dbnum != null &&
                this.controller.getMudClientByDBNum(mud_dbnum)[0])
            {
                console.log(`Skipping line from managed user user=${mud_user}/#${mud_dbnum}: ${body}`);
                return;
            }
            else
            {
                console.log(`Sending block-line from un-managed user user=${mud_user}/#${mud_dbnum}: ${body}`);
                html = `<pre><code>${body}</code></pre>`;
            }
        }

        this.emit("message", {
            roomId: this.mudCfg.name,
            senderName: mud_user,
            senderId: mud_user,
            avatarUrl: null,
            text: body,
            html: html,
            msgtype: msgtype,
            conversation_id: this.mudCfg.name,
            conversation_name: this.mudCfg.name
        });
    }

    sendMatrixNotice(body)
    {
        this._sendMatrixMessage(body, `<h1>${body}</h1>`, null, "m.notice",
                                null, null);
    }

    sendMatrixBlock(body, msgtype="m.text")
    {
        this._sendMatrixMessage(body, `<pre><code>${body}</code></pre>`, null,
                                msgtype, null, null);
    }

    sendPlayerSetup()
    {
        this.socket.write("@set me=nospoof\n");
        this.socket.write("@pemit me=--__--LOGGED_IN--__--\n");
    }

    send(msg, sender, isMe)
    {
        if (msg.endsWith(this.dedup))
            msg = msg.slice(0, msg.length - 2);
        if (isMe)
        {
            if (msg.startsWith("@"))
                this.socket.write(msg.slice(1) + "\n");
            else
                this.socket.write('"' + msg + "\n");
        }
        else
            this.socket.write(`@emit ${sender} says, "${msg}"\n`);
        return Promise.resolve();
    }

    sendEmote(msg, sender, isMe)
    {
        if (msg.endsWith(this.dedup))
            msg = msg.slice(0, msg.length - 2);
        if (isMe)
            this.socket.write(':' + msg + "\n");
        else
            this.socket.write(`@emit ${sender} ${msg}\n`);
        return Promise.resolve();
    }
}

module.exports = MUDClient;
