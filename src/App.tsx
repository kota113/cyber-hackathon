"use client"

import type React from "react"
import {useState} from "react"
import {Calendar, FileText, Folder, Mail, Search, Send} from "lucide-react"
import {Button} from "@/components/ui/button"
import {Input} from "@/components/ui/input"
import {Card, CardContent} from "@/components/ui/card"
import {cn} from "@/lib/utils"
import {apiClient} from "@/lib/api-client"
import type {SearchResult} from "@/types/api"
import {ApiError} from "@/types/api"

interface RecentFile {
  id: string
  name: string
  type: "notion" | "drive" | "gmail"
  lastAccessed: string
  preview: string
}

const recentFiles: RecentFile[] = [
  {
    id: "1",
    name: "プロジェクト企画書.docx",
    type: "drive",
    lastAccessed: "2時間前",
    preview: "Q4の新プロダクト企画について...",
  },
  {
    id: "2",
    name: "会議議事録 - 2024年1月",
    type: "notion",
    lastAccessed: "5時間前",
    preview: "チーム定例会議の議事録です...",
  },
  {
    id: "3",
    name: "クライアント対応メール",
    type: "gmail",
    lastAccessed: "1日前",
    preview: "お客様からのお問い合わせについて...",
  },
  {
    id: "4",
    name: "マーケティング戦略.pdf",
    type: "drive",
    lastAccessed: "2日前",
    preview: "2024年度のマーケティング戦略...",
  },
]

const getFileIcon = (type: RecentFile["type"]) => {
  switch (type) {
    case "notion":
      return <FileText className="h-4 w-4 text-primary" />
    case "drive":
      return <Folder className="h-4 w-4 text-accent" />
    case "gmail":
      return <Mail className="h-4 w-4 text-destructive" />
  }
}

const getFileTypeLabel = (type: RecentFile["type"]) => {
  switch (type) {
    case "notion":
      return "Notion"
    case "drive":
      return "Google Drive"
    case "gmail":
      return "Gmail"
  }
}

export default function KnowledgeSearchChat() {
  const [isConversationMode, setIsConversationMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [messages, setMessages] = useState<Array<{
    id: string;
    content: string;
    isUser: boolean;
    results?: SearchResult[];
    error?: string
  }>>([])
  const [isLoading, setIsLoading] = useState(false)

  // Note: API client now uses direct MCP operations, no base URL configuration needed

  const handleSearch = async () => {
    if (!searchQuery.trim() || isLoading) return

    const query = searchQuery.trim()
    const userMessage = {id: `user-${Date.now()}`, content: query, isUser: true}
    const loadingMessage = {
      id: `loading-${Date.now()}`,
      content: `「${query}」について検索しています。NotionとAsanaから関連する情報を探しています...`,
      isUser: false
    }

    setMessages([userMessage, loadingMessage])
    setIsConversationMode(true)
    setSearchQuery("")
    setIsLoading(true)

    try {
      const results = await apiClient.search(query)

      // Update the loading message with results
      const resultMessage = {
        id: `result-${Date.now()}`,
        content: results.length > 0
          ? `${results.length}件の検索結果が見つかりました：`
          : '検索結果が見つかりませんでした。別のキーワードで試してみてください。',
        isUser: false,
        results: results.length > 0 ? results : undefined
      }

      setMessages([userMessage, resultMessage])
    } catch (error) {
      console.error('Search failed:', error)

      let errorMessage = '検索中にエラーが発生しました。'
      if (error instanceof ApiError) {
        if (error.statusCode === 400) {
          errorMessage = 'クエリが無効です。別のキーワードで試してみてください。'
        } else if (error.statusCode === 500) {
          errorMessage = 'サーバーエラーが発生しました。しばらくしてから再試行してください。'
        } else {
          errorMessage = error.message
        }
      }

      const errorResultMessage = {
        id: `error-${Date.now()}`,
        content: errorMessage,
        isUser: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }

      setMessages([userMessage, errorResultMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Initial Chat Interface */}
      <div
        className={cn(
          "transition-all duration-700 ease-in-out",
          isConversationMode
            ? "transform -translate-y-32 opacity-0 pointer-events-none"
            : "transform translate-y-0 opacity-100",
        )}
      >
        <div className="flex flex-col items-center justify-center min-h-screen px-4">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">社内ナレッジ検索</h1>
            <p className="text-lg text-muted-foreground text-balance">
              Notion、Google Drive、Gmailを横断して情報を検索
            </p>
          </div>

          {/* Central Chat Box */}
          <div className="w-full max-w-2xl mb-16">
            <Card className="shadow-lg border-transparent border-0 flex-col">
              <CardContent className="p-6 py-[0]">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      placeholder="何について調べますか？"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={handleKeyPress}
                      className="pl-10 h-12 text-base border-0 focus-visible:ring-2 focus-visible:ring-accent border-transparent shadow-none"
                    />
                  </div>
                  <Button onClick={handleSearch} size="lg" className="h-12 px-6 bg-accent hover:bg-accent/90">
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Files Section */}
          <div className="w-full max-w-4xl">
            <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
              <Calendar className="w-[22px] h-[22px]" />
              最近使ったファイル
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentFiles.map((file) => (
                <Card
                  key={file.id}
                  className="hover:shadow-md transition-shadow cursor-pointer border hover:border-accent/50 border-transparent"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1">{getFileIcon(file.type)}</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground truncate">{file.name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{file.preview}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-accent font-medium">{getFileTypeLabel(file.type)}</span>
                          <span className="text-xs text-muted-foreground">{file.lastAccessed}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Conversation Interface */}
      <div
        className={cn(
          "fixed inset-0 transition-all duration-700 ease-in-out",
          isConversationMode
            ? "transform translate-y-0 opacity-100"
            : "transform translate-y-full opacity-0 pointer-events-none",
        )}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-card border-b p-4">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <h1 className="text-xl font-semibold text-foreground">社内ナレッジ検索</h1>
              <Button variant="outline" onClick={() => setIsConversationMode(false)} className="text-sm">
                新しい検索
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={cn("flex", message.isUser ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] py-3 mx-0 px-5",
                      message.isUser
                        ? "bg-accent text-accent-foreground rounded-full"
                        : "bg-card text-card-foreground border border-border rounded-lg",
                    )}
                  >
                    <p className="text-sm leading-relaxed">{message.content}</p>

                    {/* Display search results */}
                    {message.results && message.results.length > 0 && (
                      <div className="mt-4 space-y-3">
                        {message.results.map((result) => (
                          <Card key={result.id} className="border border-border">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="mt-1">
                                  {result.source === 'notion' ? (
                                    <FileText className="h-4 w-4 text-primary"/>
                                  ) : (
                                    <Calendar className="h-4 w-4 text-accent"/>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-foreground truncate text-sm">
                                    {result.title}
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-3">
                                    {result.content}
                                  </p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-accent font-medium capitalize">
                                      {result.source}
                                    </span>
                                    {result.lastModified && (
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(result.lastModified).toLocaleDateString('ja-JP')}
                                      </span>
                                    )}
                                    {result.url && (
                                      <a
                                        href={result.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:text-blue-800 underline"
                                      >
                                        開く
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}

                    {/* Display error message */}
                    {message.error && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                        <p className="text-xs text-red-700">
                          エラー詳細: {message.error}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="bg-card border-t border-border p-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Input
                    placeholder="追加で質問がありますか？"
                    className="h-12 pr-12 border-border focus-visible:ring-2 focus-visible:ring-accent rounded-full"
                  />
                  <Button
                    size="sm"
                    className="absolute right-0 top-1/2 transform -translate-y-1/2 h-12 w-14 p-0 bg-accent hover:bg-accent/90 rounded-r-full cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
