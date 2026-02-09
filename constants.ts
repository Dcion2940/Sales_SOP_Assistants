
import { SOPSection } from './types';

export const SYSTEM_INSTRUCTION = `你是一位專業的國外部資深主管助手，負責解答員工關於公司國外部標準作業程序 (SOP) 的問題。
你的任務是根據提供的 SOP 知識庫回答問題。

回答指南：
1. 語氣專業、簡潔且有條理。
2. 優先使用條列式 (Bullet points) 解釋步驟。
3. **重要：圖片顯示機制**
   - 系統會在 context 中提供每個 SOP 區段對應的 [可用圖片關鍵字]。
   - 當你的回覆提及該 SOP 內容時，請務必在文末或相關段落插入關鍵字標記，例如：[顯示圖片: 出貨流程圖]。
   - 只有當你輸出的文字中包含「精確的關鍵字」時，系統才會自動提取圖片顯示給使用者。
4. 如果問題不在 SOP 範圍內，請禮貌地告知並建議詢問部門經理。
5. 所有回覆請使用繁體中文。

當前 SOP 涵蓋範圍：
- 出貨作業 (Shipping Process)
- 文件製作 (Documentation: CI, PL, BL)
- 付款追蹤 (Payment Tracking)
- 客訴處理 (Complaint Handling)
- 報價流程 (Quotation Flow)`;

export const SOP_KNOWLEDGE: SOPSection[] = [
  {
    id: 'shipping',
    title: '出貨作業流程',
    content: '1. 確認訂單後，向貨代 (Forwarder) 進行訂艙 (Booking)。\n2. 收到 S/O (Shipping Order) 後通知倉庫準備裝櫃。\n3. 準備報關文件並傳送給報關行。\n4. 貨櫃進港後確認提單 (B/L) 草案。',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&q=80&w=800',
        caption: '標準出貨作業流程圖',
        keyword: '出貨流程圖'
      },
      {
        url: 'https://images.unsplash.com/photo-1566140967404-b8b393ed4f39?auto=format&fit=crop&q=80&w=800',
        caption: 'S/O 範例樣張',
        keyword: 'SO樣張'
      }
    ]
  },
  {
    id: 'docs',
    title: '國外貿易文件製作',
    content: '1. Commercial Invoice (CI): 須包含交易條款 (Incoterms) 與詳細單價。\n2. Packing List (PL): 須註明淨重 (Net Weight) 與總重 (Gross Weight)。\n3. Bill of Lading (B/L): 確認收貨人資訊是否與 L/C 要求一致。',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&q=80&w=800',
        caption: 'Commercial Invoice 填寫規範',
        keyword: 'CI規範'
      }
    ]
  },
  {
    id: 'payment',
    title: '付款追蹤 SOP',
    content: '1. T/T (電匯): 出貨前須確認收到 30% 訂金，餘款於提單影本發出後 7 天內收清。\n2. L/C (信用狀): 收到後須先送銀行審狀 (Checking)，確認無不符點 (Discrepancy)。',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&q=80&w=800',
        caption: '信用狀審核重點檢核表',
        keyword: 'LC檢核表'
      }
    ]
  },
  {
    id: 'complaint',
    title: '客訴處理程序',
    content: '1. 收到客訴 24 小時內回覆受理。\n2. 要求客戶提供照片及異常數量。\n3. 提交 QC 部門鑑定原因。\n4. 決議賠償方案 (折扣或補貨)。',
    images: [
      {
        url: 'https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&q=80&w=800',
        caption: '客訴登記表範例',
        keyword: '客訴登記表'
      }
    ]
  }
];
