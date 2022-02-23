
export default {
    baseUrl: process.env["BASE_URL"],
    apiAuth: {
        key: process.env["KEY"], // KC-API-KEY
        secret: process.env["SECRET"], // API-Secret
        passphrase: process.env["PASSPHRASE"], // KC-API-PASSPHRASE
    },
    authVersion: 2, // KC-API-KEY-VERSION. Notice: for v2 API-KEY, not required for v1 version.
}