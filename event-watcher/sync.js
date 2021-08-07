const {ethers} = require('ethers')
require('dotenv').config()
const mysql = require('mysql')

const abi = require("./lib/abi")

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
})

connection.connect()

// console.log(process.env)

// console.log(process.argv)

const getChains = () => {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM chain WHERE `status`= 1', (error, results, fields) => {
            if (error) {
                process.exit(0);
            } else {
                return resolve(results)
            }
        })
    })
}


const setSyncNumber = (chainId, number) => {
    connection.query("UPDATE chain SET syncNumber = ? WHERE chainId = ?", [number, chainId], function (error, results, fields) {
        if (error) process.exit(0);
    });
}


const logSave = (pairId, recipient, value, fromChain, toChain, depositHash, fee, amount) => {
    const depositTime = Math.round(new Date() / 1000)
    const data = {pairId, recipient, value, fromChain, toChain, depositHash, depositTime, fee, amount}
    connection.query('INSERT INTO log_new SET ?', data, function (error, results, fields) {
        if (error) process.exit(0);
    });
}


const getLog = (hash) => {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM `log_new` WHERE `depositHash` = ?', [hash], (err, res, fields) => {
            if (err) {
                return reject(err)
            } else {
                return resolve(res[0])
            }
        })
    })
}

const getPairNative = (fromChainId, toChainId, isMain) => {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM `pair` WHERE `fromChain` = ? AND `toChain` = ? AND `isMain` = ? AND `isNative` = 1', [fromChainId, toChainId, isMain], (err, res, fields) => {
            if (err) {
                process.exit(0);
            } else {
                return resolve(res[0])
            }
        })
    })
}

const getPair = (fromChain, toChain, fromToken, toToken) => {
    return new Promise((resolve, reject) => {
        connection.query('SELECT * FROM `pair` WHERE `fromChain` = ? AND `toChain` = ? AND `fromToken` = ? AND `toToken` = ?', [fromChain, toChain, fromToken, toToken], (err, res, fields) => {
            if (err) {
                process.exit(0);
            } else {
                return resolve(res[0])
            }
        })
    })
}


const main = async () => {
    setInterval(() => {
        sync()
    }, 3000)
}

const sync = async () => {
    const chains = await getChains()
    for (const chain of chains) {
        let provider, num
        provider = new ethers.providers.JsonRpcProvider(chain.url)
        num = await provider.getBlockNumber()
        let toNum = chain['syncLimit'] > 0 ? chain['syncNumber'] + chain['syncLimit'] : num
        if (toNum >= num) toNum -= 2
        if ((toNum - chain['syncNumber']) < 5) continue
        const bridge = new ethers.Contract(chain.bridge, abi.bridge(), provider)
        const depositLogs = await bridge.queryFilter(bridge.filters.Deposit(), chain['syncNumber'], toNum)
        for (const log of depositLogs) {
            const exist = await getLog(log.transactionHash)
            if (exist) continue
            const toChainId = log.args[0].toString()
            const fromToken = log.args[1]
            const toToken = log.args[2]
            const recipient = log.args[3]
            let value = log.args[4].toString()
            const pair = await getPair(chain.chainId, toChainId, fromToken, toToken)
            if (pair) {
                value = (value / 10 ** pair['decimal']).toFixed(pair['decimal'])
                const fee = (value * pair['bridgeFee'] / 100).toFixed(pair['decimal'])
                let amount = ethers.utils.parseUnits((value - fee).toFixed(pair['decimal']), pair['decimal'])
                amount = (amount / 10 ** pair['decimal']).toFixed(pair['decimal'])
                logSave(pair.id, recipient, value, chain.chainId, toChainId, log.transactionHash, fee, amount)
            }
        }

        const depositNativeLogs = await bridge.queryFilter(bridge.filters.DepositNative(), chain['syncNumber'], toNum)
        for (const log of depositNativeLogs) {
            const exist = await getLog(log.transactionHash)
            if (exist) continue
            const toChainId = log.args[0].toString()
            const isMain = log.args[1]
            let recipient = log.args[2]
            let value = log.args[3].toString()
            const pair = await getPairNative(chain.chainId, toChainId, isMain)
            if (pair) {
                value = (value / 10 ** pair['decimal']).toFixed(pair['decimal'])
                const fee = (value * pair['bridgeFee'] / 100).toFixed(pair['decimal'])
                let amount = ethers.utils.parseUnits((value - fee).toFixed(pair['decimal']), pair['decimal'])
                amount = (amount / 10 ** pair['decimal']).toFixed(pair['decimal'])
                logSave(pair.id, recipient, value, chain.chainId, toChainId, log.transactionHash, fee, amount)
            }
        }
        console.log(chain.chainId, toNum)
        await setSyncNumber(chain.chainId, toNum)
    }
}

main().then()