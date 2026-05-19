import assert from "node:assert/strict"
import { imageImpl } from "../extensions/web-tools/index.js"

function textContent(result: Awaited<ReturnType<typeof imageImpl>>): string {
	return result.content.find(block => block.type === "text")?.text ?? ""
}

function imageContent(result: Awaited<ReturnType<typeof imageImpl>>) {
	return result.content.find(block => block.type === "image")
}

{
	const result = await imageImpl({ url: "https://httpbin.org/image/png", timeout: 30_000 })
	const text = textContent(result)
	const image = imageContent(result)
	const details = result.details as { mimeType?: string; dimensions?: { widthPx: number; heightPx: number }; wasResized?: boolean }

	assert.match(text, /^Fetched image \[image\/png\]/)
	assert.equal(image?.mimeType, "image/png")
	assert.deepEqual(details.dimensions, { widthPx: 100, heightPx: 100 })
	assert.equal(details.wasResized, false)
}

{
	const result = await imageImpl({ url: "https://picsum.photos/3000/2000.jpg", timeout: 30_000 })
	const text = textContent(result)
	const image = imageContent(result)
	const details = result.details as {
		mimeType?: string
		dimensions?: { widthPx: number; heightPx: number }
		originalDimensions?: { widthPx: number; heightPx: number }
		wasResized?: boolean
	}

	assert.match(text, /^Fetched image \[image\/(png|jpeg)\]/)
	assert.match(text, /original 3000x2000, displayed at 2000x1333/)
	assert.match(image?.mimeType ?? "", /^image\/(png|jpeg)$/)
	assert.deepEqual(details.originalDimensions, { widthPx: 3000, heightPx: 2000 })
	assert.deepEqual(details.dimensions, { widthPx: 2000, heightPx: 1333 })
	assert.equal(details.wasResized, true)
}

console.log("web_image direct tests passed")
