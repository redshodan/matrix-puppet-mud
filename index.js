const {
    MatrixAppServiceBridge: {
        Cli, AppServiceRegistration
    },
    Puppet,
    MatrixPuppetBridgeBase,
    utils
} = require("matrix-puppet-bridge");
const MUDClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug');
const debugVerbose = debug('verbose:matrix-puppet:mud:index');

class App extends MatrixPuppetBridgeBase {
    getServicePrefix() {
        return config.servicePrefix;
    }
    getServiceName() {
        return config.serviceName;
    }
    defaultDeduplicationTag() {
        return " \u200b"; // Unicode Character 'ZERO WIDTH SPACE'
    }
    defaultDeduplicationTagPattern() {
        return "\\u200b$"; // Unicode Character 'ZERO WIDTH SPACE'
    }
    initThirdPartyClient() {
        this.threadInfo = {};
        this.userId = null;
        this.client = new MUDClient(config)
        this.client.connect();

        this.client.on('status', (statusTxt)=> {
            this.sendStatusMsg({}, statusTxt);
        });

        this.client.on('message', (data)=> {
            if (data && data.type === 'message')
            {
                try {
                    this.threadInfo[data.conversation_id] = {
                        conversation_name: data.conversation_name,
                    };
                    debugVerbose("incoming message data:", data);
                    const isMe = data.user_id.chat_id === data.self_user_id;
                    const payload = {
                        roomId: data.conversation_id,
                        senderName: data.user,
                        senderId: isMe ? undefined : data.user_id.chat_id,
                        avatarUrl: data.photo_url,
                        text: data.content,
                        html: data.html,
                        msgtype: data.msgtype
                    };
                    return this.handleThirdPartyRoomMessage(payload).catch(
                        err => {
                            console.log(
                                "handleThirdPartyRoomMessage error", err);
                            this.sendStatusMsg(
                                {}, "handleThirdPartyRoomMessage error", err);
                        });
                } catch(er) {
                    console.log("incoming message handling error:", er);
                    this.sendStatusMsg({}, "incoming message handling error:", err);
                }
            }

            // Message data format:
            /*{ user_id:
              { chat_id: '10xxxxxxxxxxxxxxxxxxx',
              gaia_id: '10xxxxxxxxxxxxxxxxxxx' },
              conversation_id: 'Ugxxxxxxxxxxxxxxxxxxxxxxxx',
              conversation_name: '+1nnnnnnnnnn',
              user: 'John Doe',
              content: 'a message!',
              type: 'message',
              status: 'success' }*/
        });

        return this.client;
    }

    // Override to make msgtype settable
    handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
        console.log('handling third party room message', thirdPartyRoomMessageData);
        let {
            roomId,
            senderName,
            senderId,
            avatarUrl,
            text,
            html,
            msgtype
        } = thirdPartyRoomMessageData;

        msgtype = msgtype || "m.txt";

        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((matrixRoomId) => {
            return this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then((client) => {
                if (senderId === undefined) {
                    console.log("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
                    console.log("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
                    console.log("if it came from a matrix client, then it's already in the client, sending again would dupe");
                    console.log("we use a tag on the end of messages to determine if it came from matrix");

                    if (this.isTaggedMatrixMessage(text)) {
                        console.log('it is from matrix, so just ignore it.');
                        return;
                    } else {
                        console.log('it is from 3rd party client');
                    }
                }

                let tag = utils.autoTagger(senderId, this);

                if (html) {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        formatted_body: html,
                        format: "org.matrix.custom.html",
                        msgtype: msgtype
                    });
                } else {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        msgtype: msgtype
                    });
                }
            });
        });
            // .catch(err=>{
            // super().sendStatusMsg({}, 'Error in '+this.handleThirdPartyRoomMessage.name, err, thirdPartyRoomMessageData);
        // });
    }

    getThirdPartyRoomDataById(id) {
        debugVerbose("getThirdPartyRoomDataById()", id)
        let roomData = {
            name: this.threadInfo[id].conversation_name,
            topic: `${config.serviceName} Chat`
        };
        return roomData;
    }
    sendReadReceiptAsPuppetToThirdPartyRoomWithId() {
        // no op for a MUD
    }
    sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
        return this.client.send(id, text);
    }
    sendImageMessageAsPuppetToThirdPartyRoomWithId(
        _thirdPartyRoomId, _data, _matrixEvent) {
        console.log("sendImageMessageAsPuppetToThirdPartyRoomWithId");
        // Nothing to do for a MUD with this
        // return Promise.resolve();
    }
    sendFileMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data,
                                                  _matrixEvent) {
        console.log("sendFileMessageAsPuppetToThirdPartyRoomWithId");
        // Nothing to do for a MUD with this
        // return Promise.resolve();
    }
    sendReadReceiptAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId) {
        console.log("sendReadReceiptAsPuppetToThirdPartyRoomWithId");
        // Nothing to do for a MUD with this
        // return Promise.resolve();
    }
}

new Cli({
    port: config.port,
    registrationPath: config.registrationPath,
    generateRegistration: function(reg, callback) {
        puppet.associate().then(()=>{
            reg.setId(AppServiceRegistration.generateToken());
            reg.setHomeserverToken(AppServiceRegistration.generateToken());
            reg.setAppServiceToken(AppServiceRegistration.generateToken());
            reg.setSenderLocalpart("mudbot");
            reg.addRegexPattern("users", `@${config.servicePrefix}_.*`, true);
            reg.addRegexPattern("aliases", `#${config.servicePrefix}_.*`, true);
            callback(reg);
        }).catch(err=>{
            console.trace();
            console.error(err.message);
            process.exit(-1);
        });
    },
    run: function(port) {
        const app = new App(config, puppet);
        return puppet.startClient().then(()=>{
            return app.initThirdPartyClient();
        }).then(() => {
            return app.bridge.run(port, config);
        }).then(()=>{
            console.log('Matrix-side listening on port %s', port);
        }).catch(err=>{
            console.error(err.message);
            process.exit(-1);
        });
    }
}).run();
