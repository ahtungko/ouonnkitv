import { Navbar, NavbarBrand, NavbarContent, Input } from '@heroui/react'
import { OkiLogo, SearchIcon } from '@/components/icons'
import { NavLink } from 'react-router'
import { useSearch } from '@/hooks'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import RecentHistory from '@/components/RecentHistory'

export default function Navigation() {
  const { search, searchMovie } = useSearch()
  const [inputContent, setInputContent] = useState('')
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      searchMovie(inputContent)
    }
  }
  useEffect(() => {
    setInputContent(search)
  }, [search])
  return (
    <motion.div
      className="sticky top-0 z-50"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{
        type: 'tween',
        duration: 0.5,
        ease: 'easeOut',
      }}
    >
      <Navbar>
        <NavbarBrand>
          <NavLink to="/" className="flex items-center gap-2">
            <motion.div layoutId="app-logo" className="flex items-end gap-2">
              <motion.div layoutId="logo-icon">
                <OkiLogo />
              </motion.div>
              <motion.p layoutId="logo-text" className="text-lg font-bold text-inherit">
                xkaTV
              </motion.p>
            </motion.div>
          </NavLink>
        </NavbarBrand>
        <NavbarContent as="div" className="items-center" justify="end">
          <motion.div layoutId="search-container" className="flex w-full justify-end">
            <Input
              classNames={{
                base: 'max-w-full sm:max-w-[15rem] h-10 hover:max-w-[24rem] transition-all duration-600',
                mainWrapper: 'h-full',
                input: 'text-small',
                inputWrapper:
                  'h-full font-normal text-default-500 bg-default-400/20 dark:bg-default-500/20',
              }}
              placeholder="输入内容搜索..."
              size="sm"
              variant="flat"
              startContent={
                <motion.div layoutId="search-icon">
                  <SearchIcon size={18} />
                </motion.div>
              }
              type="search"
              radius="full"
              value={inputContent}
              onValueChange={setInputContent}
              onKeyDown={handleKeyDown}
              onClear={() => {
                setInputContent('')
              }}
            />
          </motion.div>
          <motion.div
            layoutId="history-icon"
            className="flex items-center rounded-full p-2 transition-all duration-300 hover:cursor-pointer hover:bg-gray-200 active:bg-gray-200"
          >
            <RecentHistory />
          </motion.div>
        </NavbarContent>
      </Navbar>
    </motion.div>
  )
}
