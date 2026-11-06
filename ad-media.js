// Worker 内解码 TGS，不依赖浏览器、外部转码服务或运行时下载可执行代码。
// WASM 来源及许可证见 vendor/tlottie.LICENSE.txt。
async function readBounded(stream, limit) {
	const reader = stream.getReader(), chunks = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > limit) { await reader.cancel(); throw new Error('tgs_size'); }
			chunks.push(value);
		}
	} finally { reader.releaseLock(); }
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	return bytes;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
	return value >>> 0;
});

function pngChunk(type, data) {
	const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
	view.setUint32(0, data.length);
	bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
	let crc = 0xffffffff;
	for (let index = 4; index < bytes.length - 4; index++) crc = crcTable[(crc ^ bytes[index]) & 255] ^ crc >>> 8;
	view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
	return bytes;
}

async function encodeRgbaPng(rgba, width, height) {
	const stride = width * 4, scanlines = new Uint8Array((stride + 1) * height);
	for (let row = 0; row < height; row++) scanlines.set(rgba.subarray(row * stride, (row + 1) * stride), row * (stride + 1) + 1);
	const compressed = new Uint8Array(await new Response(new Response(scanlines).body.pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
	const header = new Uint8Array(13), view = new DataView(header.buffer);
	view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
	const chunks = [new Uint8Array([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), pngChunk('IDAT', compressed), pngChunk('IEND', new Uint8Array())];
	const png = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
	let offset = 0;
	for (const chunk of chunks) { png.set(chunk, offset); offset += chunk.length; }
	return png;
}

export async function renderAdTgsFrames(module, compressed, options = {}) {
	if (!compressed?.length || compressed.length > 1024 * 1024 || compressed[0] !== 31 || compressed[1] !== 139) throw new Error('tgs_format');
	const json = await readBounded(new Response(compressed).body.pipeThrough(new DecompressionStream('gzip')), 2 * 1024 * 1024);
	const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
	const count = Number(data.op) - Number(data.ip), rate = Number(data.fr);
	// Telegram TGS 上限为 512 像素、3 秒、60 FPS；无效输入不按空画面放行。
	if (!Number.isFinite(count) || count <= 0 || count > 180 || !Number.isFinite(rate) || rate <= 0 || rate > 60
		|| count / rate > 3.05 || !Number.isInteger(data.w) || !Number.isInteger(data.h)
		|| data.w < 1 || data.h < 1 || data.w > 512 || data.h > 512 || !Array.isArray(data.layers)) throw new Error('tgs_limits');
	const wasm = new WebAssembly.Instance(module, {}).exports;
	const input = wasm.tlottie_alloc(json.length);
	if (!input) throw new Error('tgs_memory');
	let instance = 0;
	try {
		new Uint8Array(wasm.memory.buffer, input, json.length).set(json);
		instance = wasm.tlottie_new(input, json.length);
	} finally { wasm.tlottie_free(input, json.length); }
	if (!instance) throw new Error('tgs_parse');
	try {
		const frameCount = wasm.tlottie_frame_count(instance);
		if (frameCount < 1 || frameCount > 180) throw new Error('tgs_frames');
		const order = [...new Set([0, frameCount - 1, Math.floor(frameCount / 2), Math.floor(frameCount / 4),
			Math.floor(frameCount * 3 / 4), ...Array.from({ length: frameCount }, (_, index) => index)])];
		const start = Math.max(0, Math.min(frameCount, Number(options.start) || 0));
		const end = Math.min(frameCount, start + Math.max(1, Math.min(12, Number(options.limit) || 8)));
		const frames = [];
		for (const frame of order.slice(start, end)) {
			const ptr = wasm.tlottie_render(instance, frame, data.w, data.h, 1);
			if (!ptr) throw new Error('tgs_render');
			// 先复制再 await，不能在 WASM 下一次渲染或释放后继续读共享内存。
			const rgba = new Uint8Array(wasm.memory.buffer, ptr, data.w * data.h * 4).slice();
			const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)), byte => byte.toString(16).padStart(2, '0')).join('');
			frames.push({ frame, hash, png: await encodeRgbaPng(rgba, data.w, data.h) });
		}
		return { frames, frameCount, nextFrame: end, complete: end >= frameCount, width: data.w, height: data.h };
	} finally { wasm.tlottie_drop(instance); }
}
