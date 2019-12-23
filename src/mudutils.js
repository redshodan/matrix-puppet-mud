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

function escapeMsgBody(body)
{
    let ret = body.replace("<", "&lt;");
    ret = body.replace(">", "&gt;");
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
