function idMatrixToMud(id) {
    if (id.startsWith("@"))
        return id.slice(1, id.indexOf(":"));
    else
        return id;
}

module.exports.idMatrixToMud = idMatrixToMud;
