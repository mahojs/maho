import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Maho",
  description: "wip",
  srcDir: './src',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/theming' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Theming & CSS', link: '/guide/theming' },
          { text: 'Development', link: '/guide/development' },
        ]
      },
    ]
  }
})