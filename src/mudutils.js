function zip(a,b)
{
    return a.map((x,i) => [x,b[i]]);
}

function idMatrixToMud(id)
{
    if (id.startsWith("@"))
        return id.slice(1, id.indexOf(":"));
    else
        return id;
}

function oneOnOneRoomToMudUser(roomName, mudSender)
{
    let prefix = mudSender + "_and_";
    if (roomName.startsWith(prefix))
    {
        let recipient = roomName.slice(prefix.length);
        console.log(`oneOnOneRoomToMudUser: ${recipient}`);
        return recipient;
    }
    else
        return undefined;
}

function stripPose(line, mud_user)
{
    if (line.startsWith(mud_user)) {
        line = line.slice(mud_user.length);
        if (line.startsWith(" "))
            line = line.slice(1);
    }
    return line;
}

function escapeMsgBody(body)
{
    let ret = body.replace(/</g, "&lt;");
    ret = body.replace(/>/g, "&gt;");
    return ret;
}

function matrixMud1on1Room(matrix_user, mud_user)
{
    return `${matrix_user} and ${mud_user}`.replace(/ /g, "_");
}

module.exports.zip = zip;
module.exports.idMatrixToMud = idMatrixToMud;
module.exports.escapeMsgBody = escapeMsgBody;
module.exports.matrixMud1on1Room = matrixMud1on1Room;
module.exports.oneOnOneRoomToMudUser = oneOnOneRoomToMudUser;
module.exports.stripPose = stripPose;
