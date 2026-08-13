import { render, screen } from '@testing-library/react'
import App from '../App.jsx'

test('앱 제목이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByText('단행본 시리즈 대시보드')).toBeInTheDocument()
})
