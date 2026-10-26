import { describe, expect, it } from 'vitest'
import {
  generateDandanSignature,
  parseBilibiliXml,
  parseDandanComments,
  type DandanRawComment,
} from './danmaku'

describe('danmaku helpers', () => {
  it('generates correct SHA256 base64 signature for Dandanplay API', async () => {
    const appId = 'testAppId'
    const appSecret = 'testAppSecret'
    const path = '/api/v2/comment/12345'
    const timestamp = 1700000000

    const signature = await generateDandanSignature(appId, appSecret, path, timestamp)
    expect(signature).toBeDefined()
    expect(typeof signature).toBe('string')
    expect(signature.length).toBeGreaterThan(10)

    // Repeated call with same params should be deterministic
    const signature2 = await generateDandanSignature(appId, appSecret, path, timestamp)
    expect(signature).toBe(signature2)
  })

  it('parses standard Bilibili XML comments accurately', () => {
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<i>
  <d p="12.5,1,25,16777215,1588569686,0,f93c6d68,32205706909188101">滚动白字弹幕</d>
  <d p="45.0,5,25,16711680,1588569700,0,f93c6d68,32205706909188102">顶部红字弹幕</d>
  <d p="90.2,4,25,65280,1588569750,0,f93c6d68,32205706909188103">底部绿字弹幕</d>
</i>`

    const comments = parseBilibiliXml(sampleXml)
    expect(comments).toHaveLength(3)

    expect(comments[0]).toEqual({
      text: '滚动白字弹幕',
      time: 12.5,
      mode: 0,
      color: '#ffffff',
    })

    expect(comments[1]).toEqual({
      text: '顶部红字弹幕',
      time: 45,
      mode: 1,
      color: '#ff0000',
    })

    expect(comments[2]).toEqual({
      text: '底部绿字弹幕',
      time: 90.2,
      mode: 2,
      color: '#00ff00',
    })
  })

  it('handles empty or malformed XML gracefully', () => {
    expect(parseBilibiliXml('')).toEqual([])
    expect(parseBilibiliXml('<root></root>')).toEqual([])
  })

  it('parses Dandanplay comments accurately', () => {
    const raw: DandanRawComment[] = [
      {
        cid: 1001,
        p: '15.5,1,16777215,[B站]user1,2026-01-01',
        m: '名场面打卡！',
      },
      {
        cid: 1002,
        p: '30.0,5,16711680,[腾讯]user2,2026-01-01',
        m: '前方高能预警',
      },
      {
        cid: 1003,
        p: '60.5,4,255,[爱奇艺]user3,2026-01-01',
        m: '完结撒花~',
      },
    ]

    const parsed = parseDandanComments(raw)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toEqual({
      id: '1001',
      text: '名场面打卡！',
      time: 15.5,
      mode: 0,
      color: '#ffffff',
    })
    expect(parsed[1].mode).toBe(1) // top
    expect(parsed[2].mode).toBe(2) // bottom
  })
})
