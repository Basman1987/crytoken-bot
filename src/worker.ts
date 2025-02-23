import { ethers } from "ethers"

// Constants
const TOKEN_ADDRESS = "0xB770074eA2A8325440798fDF1c29B235b31922Ae"
const ROUTER_ADDRESS = "0x145863Eb42Cf62847A6Ca784e6416C1682b1b2Ae"
const WCRO = "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23"
const USDC = "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59"

const ROUTER_ABI = ["function getAmountsOut(uint amountIn, address[] memory path) view returns (uint[] memory amounts)"]
const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]

function formatExactPrice(rawAmount: bigint, decimals: number): string {
  const amountStr = rawAmount.toString().padStart(Number(decimals) + 1, "0")
  const integerPart = amountStr.slice(0, -Number(decimals)) || "0"
  const decimalPart = amountStr.slice(-Number(decimals)).padEnd(9, "0").slice(0, 9)
  return `${integerPart}.${decimalPart}`
}

function formatLargeNumber(num: number): string {
  if (num >= 1000000000) {
    return `${(num / 1000000000).toFixed(2)}B`
  } else if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  } else if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toFixed(2)
}

export interface Env {
  DISCORD_TOKEN: string
  DISCORD_CHANNEL_ID: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return new Response("Bot is running!")
  },

  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    try {
      const provider = new ethers.JsonRpcProvider("https://evm.cronos.org/")
      const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, provider)
      const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, provider)
      const usdc = new ethers.Contract(USDC, ERC20_ABI, provider)

      // Fetch token and USDC decimals
      const [symbol, tokenDecimals, usdcDecimals] = await Promise.all([
        token.symbol(),
        token.decimals(),
        usdc.decimals(),
      ])

      const amountIn = ethers.parseUnits("1", tokenDecimals)

      // Step 1: Get Token Price in CRO
      const croAmounts = await router.getAmountsOut(amountIn, [TOKEN_ADDRESS, WCRO])
      const tokenPriceInCRO = formatExactPrice(croAmounts[1], 18)

      // Step 2: Get CRO Price in USDC
      const croToUsdcAmounts = await router.getAmountsOut(ethers.parseUnits("1", 18), [WCRO, USDC])
      const croPriceInUSDC = formatExactPrice(croToUsdcAmounts[1], usdcDecimals)

      // Step 3: Calculate Token Price in USD
      const tokenPriceInUSD = (Number.parseFloat(tokenPriceInCRO) * Number.parseFloat(croPriceInUSDC)).toFixed(9)

      // Get total supply
      const totalSupply = await token.totalSupply()
      const totalSupplyFormatted = Number(formatExactPrice(totalSupply, tokenDecimals))
      const marketCap = totalSupplyFormatted * Number(tokenPriceInUSD)
      const marketCapFormatted = formatLargeNumber(marketCap)

      // Prepare Discord message with exact price and image
      const message = {
        embeds: [
          {
            title: `${symbol} Price Update`,
            description: `
💵 USD Price: $${tokenPriceInUSD}
🪙 CRO Price: ${tokenPriceInCRO} CRO
💰 Market Cap: $${marketCapFormatted}
⏰ Updated: ${new Date().toLocaleString()}
🔗 Contract: \`${TOKEN_ADDRESS}\`
          `,
            thumbnail: {
              url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Cry_coin-V82PHcxklF3Cz3LiVLsFExW3mv9nCg.webp",
            },
            color: 0xffd700, // Gold color
          },
        ],
      }

      const response = await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      })

      if (!response.ok) {
        const errorData = await response.text()
        console.error("Discord API Response:", errorData)
        throw new Error(`Discord API error: ${response.status} ${response.statusText} - ${errorData}`)
      }
    } catch (error) {
      console.error("Error:", error)
    }
  },
}

