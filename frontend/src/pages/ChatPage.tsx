import { useEffect, useRef, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useChat } from '../hooks/useChat';
import { RecordModal } from '../components/RecordModal';
import type { ChatMessage } from '../types';

const FOOD_KEYWORDS = ['食べ', 'ランチ', '朝食', '昼食', '夕食', 'ご飯', 'ごはん', '飲ん', 'おやつ', '間食'];
const WEIGHT_KEYWORDS = ['体重', '測った', '測りました', 'kg', 'キロ'];

function detectIntent(text: string): 'meal' | 'weight' | null {
  if (FOOD_KEYWORDS.some((k) => text.includes(k))) return 'meal';
  if (WEIGHT_KEYWORDS.some((k) => text.includes(k))) return 'weight';
  return null;
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && <span className="text-2xl flex-shrink-0 mb-0.5">🦔</span>}
      <div
        className={[
          'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
          isUser
            ? 'bg-orange-500 text-white rounded-br-sm'
            : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm',
        ].join(' ')}
      >
        {msg.message}
      </div>
    </div>
  );
}

export function ChatPage() {
  const { messages, isThinking, sendMessage, clearHistory } = useChat();
  const [input, setInput] = useState('');
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [lastIntent, setLastIntent] = useState<'meal' | 'weight' | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    const intent = detectIntent(text);
    setLastIntent(intent);
    setInput('');
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Layout title="モグちゃんとチャット" noScroll
      rightAction={
        <button
          onClick={() => { if (confirm('会話履歴をリセットしますか？')) clearHistory(); }}
          className="p-2 rounded-xl hover:bg-gray-100 text-gray-400"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      }
    >
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg) => (
          <Bubble key={msg.localId ?? msg.recordId ?? msg.timestamp} msg={msg} />
        ))}

        {/* 思考中インジケータ */}
        {isThinking && (
          <div className="flex items-end gap-2">
            <span className="text-2xl flex-shrink-0">🦔</span>
            <div className="bg-white border border-gray-100 shadow-sm px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* スマート検知カード */}
        {!isThinking && lastIntent && messages[messages.length - 1]?.role === 'assistant' && (
          <div className="bg-orange-50 rounded-2xl p-3 flex items-center justify-between">
            <p className="text-xs text-orange-600 font-medium">
              {lastIntent === 'meal' ? '🍽️ 食事を記録しますか？' : '⚖️ 体重を記録しますか？'}
            </p>
            <button
              onClick={() => { setRecordModalOpen(true); setLastIntent(null); }}
              className="text-xs font-bold text-orange-500 border border-orange-300 px-3 py-1 rounded-lg"
            >
              記録する
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 入力エリア */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex items-end gap-2">
        <textarea
          className="flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 max-h-32 transition-colors"
          placeholder="メッセージを入力..."
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isThinking}
          className="w-10 h-10 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 rounded-full flex items-center justify-center text-white flex-shrink-0 transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>

      <RecordModal
        isOpen={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        onSuccess={() => setRecordModalOpen(false)}
      />
    </Layout>
  );
}
