import { useState, useCallback, useRef } from 'react';
import * as gasApi from '../lib/gasApi';
import { useAuth } from '../contexts/AuthContext';
import { generateMoguResponse, type ChatTurn } from '../lib/gemini';
import { getGeminiKey } from '../lib/db';
import type { ChatMessage } from '../types';

const INITIAL_MESSAGE: ChatMessage = {
  role: 'assistant',
  message:
    'こんにちはだモグ！今日も一緒に健康管理頑張るだモグ🌱 食べたものや体重、気軽に話しかけてほしいだモグ〜！',
  localId: 'init',
};

export function useChat() {
  const { getValidToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [isThinking, setIsThinking] = useState(false);
  const historyRef = useRef<ChatTurn[]>([]);

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: ChatMessage = {
        role: 'user',
        message: text,
        localId: `u-${Date.now()}`,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);

      try {
        const [token, apiKey] = await Promise.all([getValidToken(), getGeminiKey()]);

        let reply: string;
        if (apiKey) {
          reply = await generateMoguResponse(apiKey, historyRef.current, text);
          historyRef.current = [
            ...historyRef.current,
            { role: 'user', parts: [{ text }] },
            { role: 'model', parts: [{ text: reply }] },
          ].slice(-20); // 直近10往復を保持
        } else {
          reply =
            'Gemini APIキーが設定されていないだモグ！設定画面からAPIキーを登録してほしいだモグ🔑';
        }

        const assistantMsg: ChatMessage = {
          role: 'assistant',
          message: reply,
          localId: `a-${Date.now()}`,
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // GAS への保存はバックグラウンドで実行（UI をブロックしない）
        if (token) {
          gasApi.saveChat(token, 'user', text).catch(() => {});
          gasApi.saveChat(token, 'assistant', reply).catch(() => {});
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            message: 'ごめんだモグ、エラーが発生しちゃっただモグ…もう一度試してほしいだモグ🙏',
            localId: `err-${Date.now()}`,
          },
        ]);
      } finally {
        setIsThinking(false);
      }
    },
    [getValidToken]
  );

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setMessages([INITIAL_MESSAGE]);
  }, []);

  return { messages, isThinking, sendMessage, clearHistory };
}
