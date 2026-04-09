import { useState } from 'react';
import { chatThreads, chatMessages, formatCurrency, ChatThread } from '@/data/mockData';
import { Send, ArrowLeft, Lock } from 'lucide-react';

const ThreadList = ({ onSelect }: { onSelect: (thread: ChatThread) => void }) => (
  <div className="flex flex-col h-full">
    <div className="px-4 pt-4 pb-3">
      <h1 className="text-xl font-bold text-foreground">Caixa de Entrada</h1>
    </div>
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {chatThreads.map(thread => (
        <div
          key={thread.id}
          onClick={() => onSelect(thread)}
          className="flex items-center gap-3 px-4 py-3 active:bg-secondary transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {thread.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground truncate">{thread.leadName}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{thread.timestamp}</span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{thread.lastMessage}</p>
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded mt-1 inline-block">{thread.waNumber}</span>
          </div>
          {thread.unread > 0 && (
            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
              {thread.unread}
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

const ChatView = ({ thread, onBack }: { thread: ChatThread; onBack: () => void }) => {
  const [message, setMessage] = useState('');
  const messages = chatMessages.filter(m => m.threadId === thread.id);

  return (
    <div className="flex flex-col h-full">
      {/* Smart Header */}
      <div className="bg-card border-b border-border">
        <div className="flex items-center gap-3 px-3 py-2">
          <button onClick={onBack} className="p-1 text-muted-foreground active:scale-95 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
            {thread.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{thread.leadName}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary font-medium">{formatCurrency(thread.dealValue)}</span>
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">{thread.dealStage}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-3 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.sender === 'lead' ? 'justify-start' : msg.sender === 'ai' ? 'justify-center' : 'justify-end'}`}>
            {msg.sender === 'ai' ? (
              <div className="max-w-[90%] rounded-xl p-3 border-2 border-dashed" style={{ background: 'hsl(270 30% 15%)', borderColor: 'hsl(270 40% 35%)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <Lock size={10} className="text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">🔒 Apenas você vê isso</span>
                </div>
                <p className="text-xs text-foreground leading-relaxed">{msg.content}</p>
              </div>
            ) : (
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                msg.sender === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'
              }`}>
                <p className="text-sm">{msg.content}</p>
                <p className={`text-[10px] mt-1 text-right ${msg.sender === 'agent' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>{msg.timestamp}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2 bg-secondary rounded-full px-4 py-2">
          <input
            type="text"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Mensagem..."
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button className="p-1.5 rounded-full bg-primary text-primary-foreground active:scale-95 transition-transform">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

const InboxPage = () => {
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);

  if (selectedThread) {
    return <ChatView thread={selectedThread} onBack={() => setSelectedThread(null)} />;
  }
  return <ThreadList onSelect={setSelectedThread} />;
};

export default InboxPage;
