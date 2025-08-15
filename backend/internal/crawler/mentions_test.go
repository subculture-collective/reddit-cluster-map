package crawler

import "testing"

func TestExtractMentionedSubreddits_TitleAndSelftext(t *testing.T) {
    posts := []Post{
        {Title: "Check out /r/Golang and /r/programming"},
        {Title: "nothing here", Selftext: "but see /r/golang for more"},
        {Title: "/r/GoLang duplicate"},
    }
    got := extractMentionedSubreddits(posts)
    // Expect case-insensitive capture without duplicates: Golang, programming
    want := map[string]bool{"Golang": true, "programming": true}
    for k := range want {
        found := false
        for _, v := range got { if v == k { found = true; break } }
        if !found { t.Fatalf("expected to contain %s, got %v", k, got) }
    }
}
