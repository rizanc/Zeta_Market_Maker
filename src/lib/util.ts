import { Connection, PublicKey } from "@solana/web3.js"

export async function getSOLBalance(publicKey: string): Promise<number> {

    const connection = new Connection(process.env.network_url);
    let balance = await connection.getBalance(new PublicKey(publicKey));
    let ledgerBalance = await connection.getBalance(new PublicKey(process.env.ledger_pub_key));

    return (balance + ledgerBalance) / 1e9;

}


export async function _getSOLBalance(publicKeys: string[]): Promise<number> {

    const connection = new Connection(process.env.network_url);
    let balance: number = 0;

    for (let publicKey of publicKeys) {
        let b = await connection.getBalance(new PublicKey(publicKey));
        balance += b;
    }

    return balance / 1e9;

}