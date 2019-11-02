function zip(a,b) {
    return a.map((x,i) => [x,b[i]]);
}

function idMatrixToMud(id) {
    if (id.startsWith("@"))
        return id.slice(1, id.indexOf(":"));
    else
        return id;
}


module.exports.zip = zip;
module.exports.idMatrixToMud = idMatrixToMud;
